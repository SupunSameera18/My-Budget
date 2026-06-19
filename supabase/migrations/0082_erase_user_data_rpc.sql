-- Migration 0082: atomic GDPR erasure RPC + tombstone account sentinel.
--
-- Background: the erase-account Edge Function previously issued ~25 sequential
-- supabase-js DML calls in an order that did not respect the actual FK graph.
-- It failed in practice because:
--   * the family path deleted accounts while retained shared transactions
--     still referenced them (account_id is NOT NULL, FK NO ACTION);
--   * transfers, reconciliation_adjustments, settlements and redemption_attempts
--     were never cleaned, yet they reference accounts / auth.users with NO ACTION
--     and block deletion / the final auth.users delete;
--   * categories/subcategories are CASCADE-deleted with the user but are still
--     referenced by retained shared transactions (FK violation on cascade);
--   * invite_codes were only "revoked" (revoked_at set) while creator_id kept
--     pointing at the user, blocking the auth.users delete.
--
-- This migration moves the whole erasure into one SECURITY DEFINER function so
-- it runs atomically (no half-erased state) and in a single FK-safe order.
-- The Edge Function now calls erase_user_data() then deletes the auth user.
--
-- Privacy model (matches the finalized rule: Shared retained, Personal erased):
--   * Personal data (accounts, transfers, personal tx/goals/budgets/macros,
--     reconciliations on the user's accounts, profile, categories) -> hard-deleted.
--   * Shared family records (shared tx/goals/contributions, splits, settlements,
--     activity trail, the categories those shared tx reference) -> retained but
--     anonymized: the user reference is replaced with the tombstone sentinel.

-- ── Tombstone account sentinel ────────────────────────────────────────────────
-- Owned by the tombstone user (migration 0032). Retained shared transactions are
-- repointed here so the leaver's real (personal) accounts can be hard-deleted
-- while account_id (NOT NULL) stays valid.
INSERT INTO public.accounts (id, user_id, name, type, currency)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Former member',
  'cash',
  'USD'
)
ON CONFLICT (id) DO NOTHING;

-- ── Atomic erasure function ───────────────────────────────────────────────────
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

  -- Dissolve the family unit only when nothing references it any more (FK-safe).
  IF fu IS NOT NULL THEN
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

-- Only the service role (used by the erase-account Edge Function) may run this.
REVOKE ALL ON FUNCTION public.erase_user_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.erase_user_data(uuid) TO service_role;
