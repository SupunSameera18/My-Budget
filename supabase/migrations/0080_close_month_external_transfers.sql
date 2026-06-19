-- 0080_close_month_external_transfers.sql
-- Bugfix: Close-the-Month reconciliation had no visible effect.
--
-- rpc_close_month_adjustments (0054) only inserted audit rows into
-- reconciliation_adjustments. It never moved account balances and never created
-- the external-transfer transactions the reconciliation is supposed to represent,
-- so pressing "Close Month" appeared to do nothing.
--
-- This migration upgrades the RPC so each non-zero adjustment now ALSO:
--   * moves accounts.actual_balance_minor by delta_minor (→ the entered actual), and
--   * records an `external` transfer (mirrors rpc_external_transfer / 0011):
--       delta_minor > 0 (actual HIGHER than app) → incoming transfer (to_account_id)
--       delta_minor < 0 (actual LOWER  than app) → outgoing transfer (from_account_id)
--
-- The reconciliation_adjustments audit row is still written. Both transfers and
-- reconciliation_adjustments are excluded from analytics/budgets/breathing-room
-- (those query public.transactions only), so balances reconcile without polluting
-- income/expense reporting. All work stays inside one transaction (all-or-nothing).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_close_month_adjustments(
  p_family_unit_id UUID,
  p_adjustments    JSONB
) RETURNS INT
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql AS $$
DECLARE
  v_caller     UUID := auth.uid();
  v_adj        JSONB;
  v_account_id UUID;
  v_delta      BIGINT;
  v_note       TEXT;
  v_count      INT := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_unit_id = p_family_unit_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'not a family member' USING ERRCODE = '42501';
  END IF;

  IF p_adjustments IS NULL OR jsonb_array_length(p_adjustments) = 0 THEN
    RETURN 0;
  END IF;

  FOR v_adj IN SELECT * FROM jsonb_array_elements(p_adjustments)
  LOOP
    v_account_id := (v_adj->>'account_id')::UUID;
    v_delta      := (v_adj->>'delta_minor')::BIGINT;
    v_note       := v_adj->>'note';

    CONTINUE WHEN v_delta = 0;

    -- Defense-in-depth: account must belong to caller and be active
    IF NOT EXISTS (
      SELECT 1 FROM public.accounts
       WHERE id = v_account_id AND user_id = v_caller AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'account not found: %', v_account_id USING ERRCODE = 'P0002';
    END IF;

    -- Move the account balance to the entered actual.
    UPDATE public.accounts
       SET actual_balance_minor = actual_balance_minor + v_delta
     WHERE id = v_account_id AND user_id = v_caller AND archived_at IS NULL;

    -- Record the matching external transfer (delta sign → direction).
    IF v_delta > 0 THEN
      -- actual higher than app → money came in
      INSERT INTO public.transfers
        (user_id, type, from_account_id, to_account_id, amount_minor, date, note)
      VALUES
        (v_caller, 'external', NULL, v_account_id, v_delta, current_date,
         COALESCE(v_note, 'Close-the-month reconciliation'));
    ELSE
      -- actual lower than app → money went out
      INSERT INTO public.transfers
        (user_id, type, from_account_id, to_account_id, amount_minor, date, note)
      VALUES
        (v_caller, 'external', v_account_id, NULL, -v_delta, current_date,
         COALESCE(v_note, 'Close-the-month reconciliation'));
    END IF;

    -- Preserve the family-visible audit trail.
    INSERT INTO public.reconciliation_adjustments
      (family_unit_id, account_id, delta_minor, note, created_by)
    VALUES
      (p_family_unit_id, v_account_id, v_delta, v_note, v_caller);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_close_month_adjustments(UUID, JSONB) TO authenticated;
