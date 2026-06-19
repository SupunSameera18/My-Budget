-- Migration 0083: notify the remaining partner when a family member erases
-- their account.
--
-- A member leaving/erasing is a SHARED-family event (it changes the shared
-- ledger and dissolves the partnership), so surfacing it to the partner is
-- consistent with the privacy model — there is no personal data in the message.
-- To stay consistent with the tombstone anonymization, the notification is
-- generic ("Your partner deleted their account") and does NOT embed the
-- leaver's name or id.
--
-- The notification is written INSIDE erase_user_data (migration 0082) so it
-- shares the erasure's single atomic transaction. The INSERT is wrapped in its
-- own BEGIN/EXCEPTION sub-block so a notification failure can NEVER roll back
-- the erasure itself (mirrors rpc_mark_settled, migration 0079). Push delivery
-- is automatic: the 5-minute cron (0050) delivers any notifications row with
-- push_notified_at IS NULL regardless of type.

-- 1. Allow the new notification type.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'logging_reminder',
    'budget_threshold',
    'month_end_summary',
    'partner_shared_transaction',
    'partner_settled_up',
    'partner_account_deleted'
  ));

-- 2. erase_user_data — same as 0082, plus a partner notification on the family path.
CREATE OR REPLACE FUNCTION public.erase_user_data(target uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  tomb      CONSTANT uuid := '00000000-0000-0000-0000-000000000001';
  tomb_acct CONSTANT uuid := '00000000-0000-0000-0000-000000000002';
  fu        uuid;
  remaining int;
BEGIN
  SELECT family_unit_id INTO fu FROM family_members WHERE user_id = target;

  -- Step 1: hard-delete personal data ----------------------------------------
  DELETE FROM goal_contributions
    WHERE goal_id IN (SELECT id FROM goals WHERE user_id = target AND is_shared = false);
  DELETE FROM transactions WHERE user_id = target AND is_shared = false;
  DELETE FROM goals        WHERE user_id = target AND is_shared = false;
  DELETE FROM budgets      WHERE user_id = target;
  DELETE FROM macros       WHERE user_id = target;
  DELETE FROM transfers    WHERE user_id = target;
  DELETE FROM reconciliation_adjustments
    WHERE account_id IN (SELECT id FROM accounts WHERE user_id = target);
  DELETE FROM profiles     WHERE user_id = target;

  -- Step 2: anonymize retained shared records to the tombstone ----------------
  UPDATE transactions
    SET user_id = tomb, note = NULL, account_id = tomb_acct
    WHERE user_id = target AND is_shared = true;
  UPDATE goals              SET user_id = tomb       WHERE user_id = target AND is_shared = true;
  UPDATE goal_contributions SET user_id = tomb       WHERE user_id = target;
  UPDATE activity_trail     SET user_id = tomb       WHERE user_id = target;
  UPDATE transaction_splits SET payer_id = tomb      WHERE payer_id = target;
  UPDATE settlements        SET settled_by_id = tomb WHERE settled_by_id = target;
  UPDATE reconciliation_adjustments SET created_by = tomb WHERE created_by = target;

  -- categories/subcategories are CASCADE from auth.users but retained shared
  -- transactions reference them; (user_id,name,type) is UNIQUE so re-point the
  -- transaction to the tombstone's equivalent on collision, else re-own the row.
  UPDATE transactions t SET subcategory_id = ts.id
    FROM subcategories ls
    JOIN subcategories ts
      ON ts.user_id = tomb AND ts.category_id = ls.category_id AND ts.name = ls.name
    WHERE t.subcategory_id = ls.id AND ls.user_id = target AND t.user_id = tomb;
  UPDATE subcategories SET user_id = tomb WHERE user_id = target
    AND NOT EXISTS (
      SELECT 1 FROM subcategories x
      WHERE x.user_id = tomb AND x.category_id = subcategories.category_id AND x.name = subcategories.name
    );
  DELETE FROM subcategories WHERE user_id = target;

  UPDATE transactions t SET category_id = tc.id
    FROM categories lc
    JOIN categories tc ON tc.user_id = tomb AND tc.name = lc.name AND tc.type = lc.type
    WHERE t.category_id = lc.id AND lc.user_id = target AND t.user_id = tomb;
  UPDATE categories SET user_id = tomb WHERE user_id = target
    AND NOT EXISTS (
      SELECT 1 FROM categories x
      WHERE x.user_id = tomb AND x.name = categories.name AND x.type = categories.type
    );
  DELETE FROM categories WHERE user_id = target;

  -- Step 3: delete the user's real (personal) accounts -----------------------
  DELETE FROM accounts WHERE user_id = target;

  -- Step 4: membership, invites, notifications -------------------------------
  DELETE FROM family_members WHERE user_id = target;
  UPDATE invite_codes
    SET revoked_at = COALESCE(revoked_at, now()), creator_id = tomb
    WHERE creator_id = target;
  DELETE FROM redemption_attempts WHERE user_id = target;
  DELETE FROM notifications        WHERE user_id = target;
  DELETE FROM push_subscriptions   WHERE user_id = target;

  IF fu IS NOT NULL THEN
    -- Notify the remaining partner(s). The target's family_members row was just
    -- deleted, so this SELECT targets exactly the members who remain. Non-fatal:
    -- a notification failure must never roll back the erasure.
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
      SELECT fm.user_id,
             'partner_account_deleted',
             'A family member left',
             'Your partner deleted their account. Shared records are kept as "Former member" contributions.',
             '/family',
             jsonb_build_object('family_unit_id', fu)
        FROM public.family_members fm
       WHERE fm.family_unit_id = fu;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- Dissolve the family unit only when nothing references it any more (FK-safe).
    SELECT count(*) INTO remaining FROM family_members WHERE family_unit_id = fu;
    IF remaining = 0
       AND NOT EXISTS (SELECT 1 FROM invite_codes WHERE family_unit_id = fu)
       AND NOT EXISTS (SELECT 1 FROM settlements  WHERE family_unit_id = fu)
       AND NOT EXISTS (SELECT 1 FROM reconciliation_adjustments WHERE family_unit_id = fu) THEN
      DELETE FROM family_units WHERE id = fu;
    END IF;
  END IF;

  RETURN CASE WHEN fu IS NOT NULL THEN 'family' ELSE 'solo' END;
END;
$$;

REVOKE ALL ON FUNCTION public.erase_user_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.erase_user_data(uuid) TO service_role;
