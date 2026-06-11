-- Migration 0020: goal_contributions.macro_application_id + rpc_apply_macro goal branch (Story 5.3)
--
-- Adds macro_application_id to goal_contributions so a macro-applied contribution
-- can be traced back to its macro_application set.
-- Extends rpc_apply_macro to handle goal-targeted macros (replaces P0001 stub from 0019).
--
-- Note: goals has no current_amount column — goal progress is computed dynamically
--   as SUM(goal_contributions.amount_minor). No UPDATE to goals is needed here.
-- Note: goal-targeted macros create NO transaction row (only a goal_contributions row).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add macro_application_id to goal_contributions
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.goal_contributions
  ADD COLUMN macro_application_id UUID;
-- No DEFAULT, no NOT NULL. Manual contributions (from ContributeSheet) get NULL implicitly.

-- Re-issue revoke as defensive hygiene (confirms the 0017 revoke still holds)
REVOKE DELETE, TRUNCATE ON TABLE public.goal_contributions FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rpc_apply_macro (replaces migration 0019 version)
--
-- Goal branch replaces the P0001 stub.
-- Account branch and all surrounding logic are preserved byte-for-byte from 0019.
-- Personal goals only — shared pooled goals deferred to Story 7.11.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_apply_macro(
  p_macro_id  UUID,
  p_date      DATE DEFAULT CURRENT_DATE
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id        UUID;
  v_account_id     UUID;
  v_goal_id        UUID;
  v_category_id    UUID;
  v_amount_minor   BIGINT;
  v_cat_type       TEXT;
  v_delta          BIGINT;
  v_application_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Load and validate macro (must be owned by caller and not archived)
  SELECT account_id, goal_id, category_id, amount_minor
  INTO v_account_id, v_goal_id, v_category_id, v_amount_minor
  FROM public.macros
  WHERE id          = p_macro_id
    AND user_id     = v_user_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Macro not found or not owned' USING ERRCODE = 'P0002';
  END IF;

  -- Derive transaction type from macro's category
  SELECT type INTO v_cat_type
  FROM public.categories
  WHERE id          = v_category_id
    AND user_id     = v_user_id
    AND archived_at IS NULL;

  IF v_cat_type IS NULL THEN
    RAISE EXCEPTION 'Macro category not found, not owned, or archived';
  END IF;

  v_application_id := gen_random_uuid();

  IF v_account_id IS NOT NULL THEN
    -- Account-targeted macro: create transaction and update balance
    v_delta := CASE WHEN v_cat_type = 'income' THEN v_amount_minor ELSE -v_amount_minor END;

    INSERT INTO public.transactions (user_id, account_id, category_id, amount_minor, date, type, macro_application_id)
    VALUES (v_user_id, v_account_id, v_category_id, v_amount_minor, p_date, v_cat_type, v_application_id);

    UPDATE public.accounts
    SET actual_balance_minor = actual_balance_minor + v_delta
    WHERE id          = v_account_id
      AND user_id     = v_user_id
      AND archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account not found or not owned by this user';
    END IF;

  ELSIF v_goal_id IS NOT NULL THEN
    -- Goal-targeted macro: record contribution, no transaction row created.
    -- Personal goals only (user_id filter enforces ownership; E7 adds shared pooled goals).

    -- Verify goal exists and belongs to this user
    PERFORM 1
    FROM public.goals
    WHERE id          = v_goal_id
      AND user_id     = v_user_id
      AND archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Goal not found, not owned, or archived';
    END IF;

    -- Insert contribution linked to this macro application.
    -- Over-contribution is allowed — no cap check against target_minor.
    INSERT INTO public.goal_contributions (user_id, goal_id, amount_minor, macro_application_id, date)
    VALUES (v_user_id, v_goal_id, v_amount_minor, v_application_id, p_date);

  END IF;

  -- Update MRU timestamp (shared by both branches)
  UPDATE public.macros
  SET last_used_at = NOW()
  WHERE id      = p_macro_id
    AND user_id = v_user_id;

  RETURN v_application_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_apply_macro(uuid, date) TO authenticated;
