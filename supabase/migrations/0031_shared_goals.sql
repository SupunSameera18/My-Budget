-- 0031_shared_goals.sql
-- Story 7.11: Shared Pooled Goals
--
-- Notes on existing state (do NOT duplicate):
--   • goals.is_shared BOOLEAN was already added in migration 0024 (ADD COLUMN IF NOT EXISTS
--     is idempotent here in case of a fresh db reset ordering edge case).
--   • Migration 0024's "goal visibility" policy uses a direct family_members JOIN under
--     SECURITY INVOKER — which is blocked by RLS (each user sees only their own row).
--     This migration replaces it with a SECURITY DEFINER helper (same pattern as
--     auth_can_view_transaction in 0024).
--   • goal_contributions.date is a DATE column (not contributed_at TIMESTAMPTZ).
--
-- This migration adds:
--   1. Idempotent is_shared column guard on goals
--   2. auth_can_view_goal SECURITY DEFINER helper (bypasses family_members RLS)
--   3. Replace "goal visibility" policy to use the SECURITY DEFINER helper
--   4. goal_contributions SELECT policy for family members (post-join contributions)
--   5. rpc_create_goal: drop + recreate with p_is_shared parameter (DEFAULT false, backward-compatible)
--   6. rpc_contribute_goal: CREATE OR REPLACE → SECURITY DEFINER; adds partner contribution path

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. goals.is_shared idempotent guard (already added in 0024; no-op on existing DBs)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. auth_can_view_goal: SECURITY DEFINER helper for goals visibility
--
-- WHY SECURITY DEFINER:
--   Migration 0024's "goal visibility" policy JOINs family_members fm_owner (the
--   goal owner's row) under SECURITY INVOKER. RLS on family_members restricts
--   each user to their own row — so the JOIN to the owner's row always returns
--   NULL for a partner viewer, making partner visibility impossible.
--   SECURITY DEFINER bypasses RLS and can read both members' rows (same reasoning
--   as auth_can_view_transaction in 0024).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_can_view_goal(
  p_owner_id     UUID,
  p_is_shared    BOOLEAN,
  p_created_date DATE
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller           UUID := auth.uid();
  v_family_unit_id   UUID;
  v_viewer_join_date DATE;
BEGIN
  IF v_caller IS NULL THEN RETURN false; END IF;
  -- Own goal: always visible
  IF p_owner_id = v_caller THEN RETURN true; END IF;
  -- Personal goals of other users: never visible to partner
  IF NOT p_is_shared THEN RETURN false; END IF;

  -- Shared goal: caller must be in the same family unit as the owner,
  -- and the goal must have been created on or after the caller's join_date.
  SELECT fm_caller.family_unit_id, fm_caller.join_date
    INTO v_family_unit_id, v_viewer_join_date
    FROM public.family_members fm_caller
    JOIN public.family_members fm_owner
      ON  fm_owner.family_unit_id = fm_caller.family_unit_id
      AND fm_owner.user_id        = p_owner_id
   WHERE fm_caller.user_id = v_caller
   LIMIT 1;

  IF v_family_unit_id IS NULL THEN RETURN false; END IF;
  IF p_created_date < v_viewer_join_date THEN RETURN false; END IF;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auth_can_view_goal(UUID, BOOLEAN, DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Replace "goal visibility" policy with SECURITY DEFINER-based version (AC 4)
--    Migration 0024 created this policy with an inline JOIN that silently fails
--    under RLS. Drop and replace.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "goal visibility" ON public.goals;

CREATE POLICY "goal visibility"
  ON public.goals
  FOR SELECT TO authenticated
  USING (public.auth_can_view_goal(user_id, is_shared, created_at::date));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. goal_contributions SELECT policy: family member reads partner's post-join
--    contributions to Shared Goals (AC 3)
--
--    • Own contributions: always visible (user_id = auth.uid()).
--    • Partner contributions: visible if ALL of:
--        a) The goal is a Shared Goal viewable by the caller
--           (auth_can_view_goal — SECURITY DEFINER — handles the family JOIN).
--        b) The contribution date is on or after the viewer's own join_date.
--           (Viewer's OWN family_members row is always visible under RLS.)
--    • Multiple SELECT policies combine with OR; existing owner-only policy stays.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "family_member_reads_shared_goal_contributions"
  ON public.goal_contributions FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      goal_contributions.date >= (
        SELECT fm.join_date
          FROM public.family_members fm
         WHERE fm.user_id = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM public.goals g
         WHERE g.id = goal_contributions.goal_id
           AND public.auth_can_view_goal(g.user_id, g.is_shared, g.created_at::date)
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. rpc_create_goal: add p_is_shared parameter (AC 14)
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
-- 6. rpc_contribute_goal: extend to allow partner contributions to Shared Goals (AC 5-6)
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
