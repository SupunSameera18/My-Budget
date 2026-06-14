-- 0031_shared_goals.sql
-- Story 7.11: Shared Pooled Goals
--
-- Notes on existing state (do NOT duplicate):
--   • goals.is_shared BOOLEAN was already added in migration 0024 (ADD COLUMN IF NOT EXISTS
--     is idempotent here in case of a fresh db reset ordering edge case).
--   • goals SELECT RLS policy "goal visibility" (partner Shared goals) was already added
--     in migration 0024 — AC 4 is already satisfied; not re-created here.
--   • goal_contributions.date is a DATE column (not contributed_at TIMESTAMPTZ).
--
-- This migration adds:
--   1. Idempotent is_shared column guard on goals
--   2. goal_contributions SELECT policy for family members (post-join contributions to Shared Goals)
--   3. rpc_create_goal: drop + recreate with p_is_shared parameter (DEFAULT false, backward-compatible)
--   4. rpc_contribute_goal: CREATE OR REPLACE → SECURITY DEFINER; adds partner contribution path

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. goals.is_shared idempotent guard (already added in 0024; no-op on existing DBs)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. goal_contributions SELECT policy: family member reads partner's post-join
--    contributions to Shared Goals (AC 3)
--    Existing policy "goal_contributions_select_owner" covers own contributions.
--    Multiple SELECT policies combine with OR in Postgres.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "family_member_reads_shared_goal_contributions"
  ON public.goal_contributions FOR SELECT
  TO authenticated
  USING (
    -- own contributions always visible (covered by existing policy too)
    user_id = auth.uid()
    OR
    -- partner's contributions to a Shared Goal, post-join only
    -- (date column is DATE; no ::date cast needed)
    (
      EXISTS (
        SELECT 1 FROM public.goals g
        WHERE g.id = goal_contributions.goal_id
          AND g.is_shared = true
      )
      AND EXISTS (
        SELECT 1 FROM public.family_members fm_me
        JOIN public.family_members fm_partner
          ON  fm_partner.family_unit_id = fm_me.family_unit_id
          AND fm_partner.user_id        = goal_contributions.user_id
        WHERE fm_me.user_id = auth.uid()
          AND goal_contributions.date >= fm_me.join_date
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. rpc_create_goal: add p_is_shared parameter (AC 14)
--    Must DROP the old 2-param overload first — Postgres cannot CREATE OR REPLACE
--    when adding a new parameter (dev-learnings §23).
--    p_is_shared DEFAULT false makes existing callers backward-compatible.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.rpc_create_goal(text, bigint);

CREATE FUNCTION public.rpc_create_goal(
  p_name         TEXT,
  p_target_minor BIGINT,
  p_is_shared    BOOLEAN DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_goal_id uuid;
BEGIN
  INSERT INTO public.goals (user_id, name, target_minor, is_shared)
  VALUES (v_user_id, p_name, p_target_minor, p_is_shared)
  RETURNING id INTO v_goal_id;
  RETURN v_goal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_create_goal(text, bigint, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. rpc_contribute_goal: extend to allow partner contributions to Shared Goals (AC 5-6)
--    Change to SECURITY DEFINER so it can read partner's family_members row
--    (RLS on family_members restricts to own row under SECURITY INVOKER).
--    Existing owner-contribution behaviour is preserved exactly.
--    Partner path: validates is_shared=true, checks same family_unit, then inserts.
--    Raises P0001 if partner tries to contribute to a Personal goal.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_contribute_goal(
  p_goal_id      uuid,
  p_amount_minor bigint,
  p_date         date DEFAULT CURRENT_DATE
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller          uuid := auth.uid();
  v_goal            goals%ROWTYPE;
  v_contribution_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_goal
  FROM public.goals
  WHERE id = p_goal_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Goal not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_goal.user_id <> v_caller THEN
    -- Partner contribution path
    IF NOT v_goal.is_shared THEN
      RAISE EXCEPTION 'Cannot contribute to another user''s personal goal'
        USING ERRCODE = 'P0001';
    END IF;

    -- Verify caller is a family member with the goal owner (SECURITY DEFINER reads both rows)
    IF NOT EXISTS (
      SELECT 1 FROM public.family_members fm_me
      JOIN public.family_members fm_owner
        ON  fm_owner.family_unit_id = fm_me.family_unit_id
        AND fm_owner.user_id        = v_goal.user_id
      WHERE fm_me.user_id = v_caller
    ) THEN
      RAISE EXCEPTION 'Not a family member of goal owner' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.goal_contributions (goal_id, user_id, amount_minor, date)
  VALUES (p_goal_id, v_caller, p_amount_minor, p_date)
  RETURNING id INTO v_contribution_id;

  RETURN v_contribution_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_contribute_goal(uuid, bigint, date) TO authenticated;
