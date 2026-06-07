-- Story 4.1: budgets + budget_categories tables, RLS, and rpc_create_budget

-- budgets table
CREATE TABLE public.budgets (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  name          text NOT NULL,
  limit_minor   bigint NOT NULL CHECK (limit_minor > 0),
  period_type   text NOT NULL CHECK (period_type IN ('weekly','monthly','yearly','custom')),
  period_start  date,
  period_end    date,
  archived_at   timestamptz,
  created_at    timestamptz DEFAULT now() NOT NULL,
  updated_at    timestamptz DEFAULT now() NOT NULL
);

-- budget_categories join table (multi-category budget support)
CREATE TABLE public.budget_categories (
  budget_id   uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  PRIMARY KEY (budget_id, category_id)
);

-- Fast per-user lookups
CREATE INDEX idx_budgets_user_id ON public.budgets (user_id);
CREATE INDEX idx_budget_categories_budget_id ON public.budget_categories (budget_id);

-- RLS on budgets
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY budgets_select_owner ON public.budgets FOR SELECT USING (user_id = auth.uid());
CREATE POLICY budgets_insert_owner ON public.budgets FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY budgets_update_owner ON public.budgets FOR UPDATE USING (user_id = auth.uid());
REVOKE DELETE, TRUNCATE ON public.budgets FROM anon, authenticated;

-- RLS on budget_categories (scoped via budgets.user_id)
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_categories_select_owner ON public.budget_categories FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.budgets b WHERE b.id = budget_id AND b.user_id = auth.uid()));
CREATE POLICY budget_categories_insert_owner ON public.budget_categories FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.budgets b WHERE b.id = budget_id AND b.user_id = auth.uid()));

-- rpc_create_budget: atomic insert into budgets + budget_categories
CREATE OR REPLACE FUNCTION public.rpc_create_budget(
  p_name         text,
  p_limit_minor  bigint,
  p_period_type  text,
  p_period_start date,
  p_period_end   date,
  p_category_ids uuid[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid;
  v_budget_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.budgets (user_id, name, limit_minor, period_type, period_start, period_end)
  VALUES (v_user_id, p_name, p_limit_minor, p_period_type, p_period_start, p_period_end)
  RETURNING id INTO v_budget_id;

  INSERT INTO public.budget_categories (budget_id, category_id)
  SELECT v_budget_id, unnest(p_category_ids);

  RETURN v_budget_id;
END;
$$;
