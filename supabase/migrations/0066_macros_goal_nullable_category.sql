-- Migration 0066: goal-targeted macros no longer require a category
--
-- Changes:
--   1. Drop NOT NULL from macros.category_id (goal macros have no expense category).
--   2. Update rpc_apply_macro to skip category lookup for the goal branch.
--   3. Grant DELETE on macros to authenticated + add RLS policy allowing owners to
--      hard-delete their own archived (soft-deleted) macros.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Allow NULL category_id on macros (goal-targeted macros don't use a category)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.macros ALTER COLUMN category_id DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rpc_apply_macro — skip category lookup for goal-targeted macros
--
-- Previously the function always looked up category type before branching,
-- which raised an error for goal macros with NULL category_id.
-- Now the category lookup and its NULL-guard live inside the account branch only.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Allow authenticated users to hard-delete their own ARCHIVED macros
--
-- The original migration 0018 revoked DELETE from both anon and authenticated.
-- We now re-grant DELETE to authenticated only, guarded by an RLS policy that
-- restricts deletion to rows where archived_at IS NOT NULL.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT DELETE ON public.macros TO authenticated;

CREATE POLICY macros_delete_archived ON public.macros
  FOR DELETE
  USING (user_id = auth.uid() AND archived_at IS NOT NULL);
