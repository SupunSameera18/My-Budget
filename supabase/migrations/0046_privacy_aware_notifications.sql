-- 0046_privacy_aware_notifications.sql
-- Story 9.7: Privacy-Aware Notifications
--
-- Extends rpc_reclassify_transaction (0029) to clean up the partner's
-- partner_shared_transaction notification when a Shared→Personal
-- reclassification occurs. No DROP needed — signature unchanged
-- (same RETURNS void, same params); the entire existing body from 0029
-- is preserved verbatim, with the cleanup block appended inside the
-- Shared→Personal branch, after the existing activity_trail INSERT.
--
-- Two-case cleanup (see story 9.7 Dev Notes):
--   Case A — push not yet delivered (push_notified_at IS NULL): hard-DELETE
--            the notification row; the partner never sees it and the 9.6
--            pg_cron push delivery job won't find it.
--   Case B — push already delivered (push_notified_at IS NOT NULL): cannot
--            unsend the push, so set dismissed_at + read_at to remove it
--            from the inbox (soft-delete pattern from 9.1).
--
-- Personal→Shared reclassification is untouched — there is no partner
-- notification to clean up for a previously-Personal transaction.

CREATE OR REPLACE FUNCTION public.rpc_reclassify_transaction(
  p_transaction_id UUID,
  p_new_is_shared  BOOLEAN
) RETURNS void
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
AS $$
DECLARE
  v_caller          UUID := auth.uid();
  v_tx              RECORD;
  v_partner_join_date DATE;
  v_partner_id      UUID;
BEGIN
  -- Guard: anonymous callers get nothing
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Load transaction (owner-only — we need user_id to enforce ownership)
  SELECT id, user_id, is_shared, date, amount_minor, archived_at
    INTO v_tx
    FROM public.transactions
   WHERE id = p_transaction_id
     AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction not found' USING ERRCODE = 'P0002';
  END IF;

  -- Guard: only the transaction owner may reclassify
  IF v_tx.user_id <> v_caller THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  -- Guard: already that type — no-op needed
  IF v_tx.is_shared = p_new_is_shared THEN
    RAISE EXCEPTION 'transaction is already that type' USING ERRCODE = 'P0001';
  END IF;

  -- Settled-period stub (deferred to E8):
  -- IF EXISTS (SELECT 1 FROM information_schema.tables
  --            WHERE table_schema = 'public' AND table_name = 'settle_up_periods') THEN
  --   IF EXISTS (SELECT 1 FROM public.settle_up_periods
  --              WHERE settled_at IS NOT NULL
  --                AND period_start <= v_tx.date AND v_tx.date <= period_end) THEN
  --     RAISE EXCEPTION 'settled period — use correction entry' USING ERRCODE = 'P0004';
  --   END IF;
  -- END IF;
  -- Currently always passes (no settle_up_periods table until E8).

  IF p_new_is_shared = true THEN
    -- ── Personal → Shared ──────────────────────────────────────────────────

    -- Pre-join block: find the partner's join_date (if a partner exists)
    SELECT fm_other.join_date INTO v_partner_join_date
      FROM public.family_members fm_caller
      JOIN public.family_members fm_other
        ON fm_other.family_unit_id = fm_caller.family_unit_id
       AND fm_other.user_id <> fm_caller.user_id
     WHERE fm_caller.user_id = v_caller
     LIMIT 1;

    -- If no partner yet, v_partner_join_date IS NULL → skip block (allow)
    IF v_partner_join_date IS NOT NULL AND v_tx.date < v_partner_join_date THEN
      RAISE EXCEPTION 'pre-join transaction cannot be shared' USING ERRCODE = 'P0003';
    END IF;

    -- Flip to Shared
    UPDATE public.transactions
       SET is_shared  = true,
           updated_at = now()
     WHERE id      = p_transaction_id
       AND user_id = v_caller;

    -- Auto-create equal split if none exists
    IF NOT EXISTS (
      SELECT 1 FROM public.transaction_splits
       WHERE transaction_id = p_transaction_id
    ) THEN
      INSERT INTO public.transaction_splits
        (transaction_id, payer_id, payer_share_minor, partner_share_minor, split_method)
      VALUES (
        p_transaction_id,
        v_caller,
        CEIL(v_tx.amount_minor::NUMERIC / 2)::BIGINT,
        v_tx.amount_minor - CEIL(v_tx.amount_minor::NUMERIC / 2)::BIGINT,
        'equal'
      );
    END IF;

    -- Activity trail
    INSERT INTO public.activity_trail (user_id, transaction_id, change_type, changed_fields)
    VALUES (
      v_caller,
      p_transaction_id,
      'reclassified_to_shared',
      jsonb_build_object('is_shared', jsonb_build_object('old', false, 'new', true))
    );

  ELSE
    -- ── Shared → Personal ─────────────────────────────────────────────────

    -- Hard-delete split row (see comment at top of file re: AR-5 exception)
    DELETE FROM public.transaction_splits
     WHERE transaction_id = p_transaction_id;

    -- Flip to Personal
    UPDATE public.transactions
       SET is_shared  = false,
           updated_at = now()
     WHERE id      = p_transaction_id
       AND user_id = v_caller;

    -- Activity trail (partner auto-loses visibility via RLS when is_shared=false)
    INSERT INTO public.activity_trail (user_id, transaction_id, change_type, changed_fields)
    VALUES (
      v_caller,
      p_transaction_id,
      'reclassified_to_personal',
      jsonb_build_object('is_shared', jsonb_build_object('old', true, 'new', false))
    );

    -- [STORY 9.7 ADDITION — Shared→Personal notification cleanup]
    -- Find the partner who may have received a partner_shared_transaction
    -- notification referencing this transaction.
    SELECT fm_partner.user_id INTO v_partner_id
      FROM public.family_members fm_caller
      JOIN public.family_members fm_partner
        ON fm_partner.family_unit_id = fm_caller.family_unit_id
       AND fm_partner.user_id <> v_caller
     WHERE fm_caller.user_id = v_caller
     LIMIT 1;

    IF v_partner_id IS NOT NULL THEN
      -- Case A: push not yet delivered → DELETE the notification entirely
      DELETE FROM public.notifications
       WHERE user_id = v_partner_id
         AND type = 'partner_shared_transaction'
         AND (metadata->>'transaction_id') = p_transaction_id::text
         AND push_notified_at IS NULL;

      -- Case B: push already delivered → mark as dismissed so it leaves the inbox
      UPDATE public.notifications
         SET dismissed_at = now(),
             read_at      = COALESCE(read_at, now())
       WHERE user_id = v_partner_id
         AND type = 'partner_shared_transaction'
         AND (metadata->>'transaction_id') = p_transaction_id::text
         AND push_notified_at IS NOT NULL
         AND dismissed_at IS NULL;
    END IF;
    -- [END STORY 9.7 ADDITION]

  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_reclassify_transaction(UUID, BOOLEAN)
  TO authenticated;
