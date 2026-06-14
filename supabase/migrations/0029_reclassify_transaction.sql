-- 0029_reclassify_transaction.sql
-- Story 7.8: Reclassify Personal ↔ Shared
--
-- ALSO: Expands activity_trail.change_type CHECK constraint to include
--   'reclassified_to_shared' and 'reclassified_to_personal' (new values from 7.8).
--   Approach: drop old constraint, add new one with the full set.

ALTER TABLE public.activity_trail
  DROP CONSTRAINT IF EXISTS activity_trail_change_type_check;

ALTER TABLE public.activity_trail
  ADD CONSTRAINT activity_trail_change_type_check
  CHECK (change_type IN (
    'edit',
    'delete',
    'reclassified_to_shared',
    'reclassified_to_personal'
  ));
--
-- Adds:
--   rpc_reclassify_transaction — SECURITY DEFINER; flips is_shared on a transaction
--                                 the caller OWNS; enforces owner-only, pre-join-date,
--                                 and settled-period (stubbed) safety blocks; auto-creates
--                                 equal split on Personal→Shared; hard-deletes split row
--                                 on Shared→Personal; writes activity_trail entry.
--
-- WHY SECURITY DEFINER:
--   The function needs to read BOTH family_members rows (caller and partner) to find the
--   partner's join_date for the pre-join block. Under SECURITY INVOKER, RLS on
--   family_members only exposes the caller's own row, making the partner join_date query
--   structurally impossible.
--   An explicit auth.uid() IS NULL guard prevents anonymous exploitation.
--
-- Shared→Personal split hard-delete:
--   When a transaction is reclassified to Personal its split record becomes an orphan.
--   Soft-delete would create reconciliation debt (AR-5 exception; see dev-learnings §11).
--   Hard-delete is correct: partner cannot query a split that no longer applies.

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

  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_reclassify_transaction(UUID, BOOLEAN)
  TO authenticated;
