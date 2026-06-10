-- Story 4.5: goals + goal_contributions tables, RLS, RPCs

-- goals table
CREATE TABLE public.goals (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  target_minor bigint NOT NULL CHECK (target_minor > 0),
  archived_at  timestamptz,
  created_at   timestamptz DEFAULT now() NOT NULL,
  updated_at   timestamptz DEFAULT now() NOT NULL
);

-- goal_contributions table (append-only and immutable)
CREATE TABLE public.goal_contributions (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id      uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  date         date NOT NULL DEFAULT CURRENT_DATE,
  created_at   timestamptz DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX idx_goals_user_id ON public.goals (user_id);
CREATE INDEX idx_goal_contributions_goal_id ON public.goal_contributions (goal_id);
CREATE INDEX idx_goal_contributions_user_id ON public.goal_contributions (user_id);

-- RLS on goals
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY goals_select_owner ON public.goals FOR SELECT USING (user_id = auth.uid());
CREATE POLICY goals_insert_owner ON public.goals FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY goals_update_owner ON public.goals FOR UPDATE USING (user_id = auth.uid());
-- No DELETE policy — soft-delete only via archived_at
REVOKE DELETE, TRUNCATE ON public.goals FROM anon, authenticated;

-- RLS on goal_contributions (append-only — no UPDATE or DELETE policies)
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_contributions_select_owner ON public.goal_contributions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY goal_contributions_insert_owner ON public.goal_contributions
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.goals
      WHERE id = goal_contributions.goal_id
        AND user_id = auth.uid()
        AND archived_at IS NULL
    )
  );
-- Contributions are append-only and immutable
REVOKE UPDATE, DELETE, TRUNCATE ON public.goal_contributions FROM anon, authenticated;

-- rpc_create_goal: creates a new personal goal for the authenticated user
CREATE OR REPLACE FUNCTION public.rpc_create_goal(
  p_name         text,
  p_target_minor bigint
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_goal_id uuid;
BEGIN
  INSERT INTO public.goals (user_id, name, target_minor)
  VALUES (v_user_id, p_name, p_target_minor)
  RETURNING id INTO v_goal_id;
  RETURN v_goal_id;
END;
$$;

-- rpc_contribute_goal: records a contribution to a goal the caller owns
CREATE OR REPLACE FUNCTION public.rpc_contribute_goal(
  p_goal_id      uuid,
  p_amount_minor bigint,
  p_date         date DEFAULT CURRENT_DATE
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_goal_exists    boolean;
  v_contribution_id uuid;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.goals
    WHERE id = p_goal_id
      AND user_id = v_user_id
      AND archived_at IS NULL
  ) INTO v_goal_exists;

  IF NOT v_goal_exists THEN
    RAISE EXCEPTION 'Goal not found or not owned by user' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.goal_contributions (goal_id, user_id, amount_minor, date)
  VALUES (p_goal_id, v_user_id, p_amount_minor, p_date)
  RETURNING id INTO v_contribution_id;

  RETURN v_contribution_id;
END;
$$;
