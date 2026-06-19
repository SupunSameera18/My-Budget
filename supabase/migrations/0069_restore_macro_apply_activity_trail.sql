-- 0069_restore_macro_apply_activity_trail.sql
--
-- Migration 0066 re-created rpc_apply_macro to fix NULL category_id for goal
-- macros, but accidentally dropped the RETURNING clause and activity_trail
-- INSERT that migration 0062 had added. This migration restores them.

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
  v_tx_id          UUID;
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

  v_application_id := gen_random_uuid();

  IF v_account_id IS NOT NULL THEN
    -- Account-targeted macro: validate category, create transaction, update balance.
    SELECT type INTO v_cat_type
    FROM public.categories
    WHERE id          = v_category_id
      AND user_id     = v_user_id
      AND archived_at IS NULL;

    IF v_cat_type IS NULL THEN
      RAISE EXCEPTION 'Macro category not found, not owned, or archived';
    END IF;

    v_delta := CASE WHEN v_cat_type = 'income' THEN v_amount_minor ELSE -v_amount_minor END;

    INSERT INTO public.transactions (user_id, account_id, category_id, amount_minor, date, type, macro_application_id)
    VALUES (v_user_id, v_account_id, v_category_id, v_amount_minor, p_date, v_cat_type, v_application_id)
    RETURNING id INTO v_tx_id;

    UPDATE public.accounts
    SET actual_balance_minor = actual_balance_minor + v_delta
    WHERE id          = v_account_id
      AND user_id     = v_user_id
      AND archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account not found or not owned by this user';
    END IF;

    -- Write activity trail entry for the macro-created transaction.
    INSERT INTO public.activity_trail (user_id, transaction_id, change_type, changed_fields)
    VALUES (v_user_id, v_tx_id, 'macro_apply', '{}'::JSONB);

  ELSIF v_goal_id IS NOT NULL THEN
    -- Goal-targeted macro: record contribution, no transaction row or trail entry.
    PERFORM 1
    FROM public.goals
    WHERE id          = v_goal_id
      AND user_id     = v_user_id
      AND archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Goal not found, not owned, or archived';
    END IF;

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
