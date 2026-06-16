-- 0051_settled_period_guard.sql
-- Phase 2 Task 2b: implement the settled-period reclassification guard
-- (FR-15a / FR-49), replacing the no-op P0004 stub left in rpc_reclassify_transaction
-- since migration 0029 (it checked for a `settle_up_periods` table that Epic 8 never
-- shipped — the real schema tracks settlement via a watermark on `settlements.settled_at`,
-- not a separate periods table).
--
-- Rule (PRD FR-15a / FR-49): a reclassification that would alter a Transaction dated
-- in an already-settled period is blocked and routed through the correction-entry
-- flow (rpc_reconciliation_adjustment, Story 8.3) instead of mutating closed history.
-- "Already settled" = the transaction's date is on/before the family unit's latest
-- settlement watermark (public.settlements, MAX(settled_at), same cutoff rpc_settle_up
-- itself uses). This applies to BOTH directions:
--   - Shared→Personal on a pre-watermark date would retroactively remove a split that
--     already contributed to a settled tally.
--   - Personal→Shared on a pre-watermark date would retroactively inject a NEW split
--     contribution into an already-settled tally.
-- A solo user (no family) or a family with no settlement yet is never blocked — there
-- is nothing "closed" to protect.
--
-- The TS server action (reclassifyTransaction) already branches P0004 with
-- "This transaction is in a settled period. Use a correction entry instead." —
-- no client change needed.

CREATE OR REPLACE FUNCTION public.rpc_reclassify_transaction(
  p_transaction_id UUID,
  p_new_is_shared  BOOLEAN
) RETURNS void
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
AS $$
DECLARE
  v_caller         UUID := auth.uid();
  v_tx             RECORD;
  v_partner_id     UUID;
  v_family_unit_id UUID;
  v_settled_cutoff DATE;
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

  -- Settled-period guard (FR-15a / FR-49): find the caller's family unit (if any)
  -- and its latest settlement watermark. A reclassification touching a date on/before
  -- that watermark would mutate an already-settled tally — block it.
  SELECT fm.family_unit_id INTO v_family_unit_id
    FROM public.family_members fm
   WHERE fm.user_id = v_caller
   LIMIT 1;

  IF v_family_unit_id IS NOT NULL THEN
    SELECT (MAX(s.settled_at) AT TIME ZONE 'UTC')::date INTO v_settled_cutoff
      FROM public.settlements s
     WHERE s.family_unit_id = v_family_unit_id;

    IF v_settled_cutoff IS NOT NULL AND v_tx.date <= v_settled_cutoff THEN
      RAISE EXCEPTION 'settled period — use correction entry' USING ERRCODE = 'P0004';
    END IF;
  END IF;

  IF p_new_is_shared = true THEN
    -- ── Personal → Shared ──────────────────────────────────────────────────
    -- No pre-join date block — Shared transactions are visible to partners
    -- regardless of when they were dated (finalized rule — AR-15).

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

    -- Hard-delete split row (see comment at top of 0046 re: AR-5 exception)
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

    -- [STORY 9.7] Shared→Personal notification cleanup — find the partner who
    -- may have received a partner_shared_transaction notification referencing
    -- this transaction.
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

  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_reclassify_transaction(UUID, BOOLEAN)
  TO authenticated;
