-- 0047_partner_notification_idempotency_respects_dismissed.sql
-- Code review follow-up for Story 9.7: rpc_notify_partner_shared_transaction's
-- idempotency check (migration 0044, step 6) ignores dismissed_at, so a
-- dismiss-then-reshare cycle silently drops the re-share notification.
--
-- Repro sequence this fixes:
--   1. Alice logs a shared tx → partner_shared_transaction notification
--      inserted for bob, push delivered (push_notified_at set).
--   2. Alice reclassifies to Personal → 0046 Case B sets dismissed_at
--      (push already delivered, can't unsend — row stays, not deleted).
--   3. Alice reclassifies back to Shared → rpc_notify_partner_shared_transaction
--      fires again for the SAME transaction_id. The old EXISTS check matched
--      the dismissed row (it didn't filter dismissed_at) and returned early
--      without inserting a new notification — bob never learns about the
--      re-share.
--
-- Fix: the idempotency EXISTS check now only counts active (non-dismissed)
-- notifications. A dismissed row no longer blocks a fresh insert, so the
-- re-share correctly produces a new, undismissed notification for the
-- partner. The 0046 cleanup logic is unaffected — its DELETE/UPDATE filters
-- already scope to push_notified_at and (for the UPDATE) dismissed_at IS NULL,
-- so it never re-touches an already-dismissed historical row.
--
-- No DROP needed — signature unchanged (same RETURNS void, same params).
-- Entire existing body from 0044 preserved verbatim except the one-line
-- idempotency check.

CREATE OR REPLACE FUNCTION public.rpc_notify_partner_shared_transaction(
  p_transaction_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tx             RECORD;
  v_fm_caller      RECORD;
  v_fm_partner     RECORD;
  v_account        RECORD;
BEGIN
  -- 1. Load transaction — must be Shared and owned by the caller
  SELECT t.id, t.user_id, t.is_shared, t.date, t.amount_minor,
         t.account_id, c.name AS category_name
  INTO v_tx
  FROM public.transactions t
  LEFT JOIN public.categories c ON c.id = t.category_id
  WHERE t.id = p_transaction_id
    AND t.archived_at IS NULL;

  IF NOT FOUND THEN RETURN; END IF;
  IF NOT v_tx.is_shared THEN RETURN; END IF;

  -- Auth guard: caller must own the transaction (defense-in-depth)
  IF v_tx.user_id <> auth.uid() THEN RETURN; END IF;

  -- 2. Get caller's family membership
  SELECT fm.family_unit_id, fm.join_date
  INTO v_fm_caller
  FROM public.family_members fm
  WHERE fm.user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF; -- caller is not in a family

  -- 3. Get partner's family membership
  SELECT fm.user_id AS partner_id, fm.join_date AS partner_join_date
  INTO v_fm_partner
  FROM public.family_members fm
  WHERE fm.family_unit_id = v_fm_caller.family_unit_id
    AND fm.user_id <> auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF; -- no partner yet

  -- 4. Join-date invariant: transaction must be on/after partner's join date
  IF v_tx.date < v_fm_partner.partner_join_date THEN RETURN; END IF;

  -- 5. Get account currency for the notification body
  SELECT currency INTO v_account
  FROM public.accounts
  WHERE id = v_tx.account_id;

  -- 6. Idempotency: skip if partner already has an ACTIVE notification for
  --    this transaction. [STORY 9.7 FOLLOW-UP] A dismissed row (left behind
  --    by 0046's Shared→Personal cleanup, Case B) no longer counts — a
  --    dismiss-then-reshare cycle must produce a fresh notification.
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = v_fm_partner.partner_id
      AND type = 'partner_shared_transaction'
      AND (metadata->>'transaction_id') = p_transaction_id::text
      AND dismissed_at IS NULL
  ) THEN RETURN; END IF;

  -- 7. Insert notification for the PARTNER (not the caller)
  INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
  VALUES (
    v_fm_partner.partner_id,
    'partner_shared_transaction',
    'Partner added a shared transaction',
    'A new shared transaction was logged. Tap to review.',
    '/transactions/' || p_transaction_id::text,
    jsonb_build_object(
      'transaction_id', p_transaction_id,
      'amount_minor',   v_tx.amount_minor,
      'currency',       COALESCE(v_account.currency, 'USD'),
      'category_name',  COALESCE(v_tx.category_name, '')
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_notify_partner_shared_transaction(UUID) TO authenticated;
