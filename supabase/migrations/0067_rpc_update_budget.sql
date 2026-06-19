-- Story 4.1 follow-up: rpc_update_budget and rpc_archive_budget
-- budget_categories has DELETE revoked for authenticated role, so category
-- replacement must run inside a SECURITY DEFINER function.

CREATE OR REPLACE FUNCTION public.rpc_update_budget(
  p_budget_id    uuid,
  p_name         text,
  p_limit_minor  bigint,
  p_period_type  text,
  p_period_start date,
  p_period_end   date,
  p_category_ids uuid[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Verify ownership and that budget is not archived
  IF NOT EXISTS (
    SELECT 1 FROM public.budgets
    WHERE id = p_budget_id AND user_id = v_user_id AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Budget not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.budgets
  SET
    name         = p_name,
    limit_minor  = p_limit_minor,
    period_type  = p_period_type,
    period_start = p_period_start,
    period_end   = p_period_end,
    updated_at   = now()
  WHERE id = p_budget_id AND user_id = v_user_id;

  -- Replace categories atomically
  DELETE FROM public.budget_categories WHERE budget_id = p_budget_id;
  INSERT INTO public.budget_categories (budget_id, category_id)
  SELECT p_budget_id, unnest(p_category_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_archive_budget(
  p_budget_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.budgets
  SET archived_at = now(), updated_at = now()
  WHERE id = p_budget_id AND user_id = v_user_id AND archived_at IS NULL;
END;
$$;
