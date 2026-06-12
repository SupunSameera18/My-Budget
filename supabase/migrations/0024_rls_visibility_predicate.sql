-- 0024_rls_visibility_predicate.sql
-- Epic 7 Story 7.1b: auth_can_view_transaction predicate + RLS policies on
-- transactions, goals, and activity_trail.
--
-- WHY SECURITY DEFINER:
--   SECURITY INVOKER would run the function as the calling authenticated user.
--   The family_members SELECT policy ("user sees own membership row") only exposes
--   the caller's own row — so the JOIN to the owner's row inside the function would
--   always return NULL, making partner visibility impossible.
--   SECURITY DEFINER runs as the function owner (postgres/service role) and can read
--   both members' rows. The explicit auth.uid() IS NULL guard ensures no unauthenticated
--   caller can exploit the elevated access.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Visibility predicate function
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_can_view_transaction(
  p_owner_id    UUID,
  p_is_shared   BOOLEAN,
  p_created_date DATE
) RETURNS BOOLEAN
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
AS $$
DECLARE
  v_caller         UUID := auth.uid();
  v_family_unit_id UUID;
  v_viewer_join_date DATE;
  v_caller_hide    BOOLEAN;
  v_owner_hide     BOOLEAN;
BEGIN
  -- Guard: anonymous callers get nothing
  IF v_caller IS NULL THEN RETURN false; END IF;

  -- Condition 1: own row always visible
  IF p_owner_id = v_caller THEN RETURN true; END IF;

  -- All remaining conditions require a shared-family context.
  -- First establish: are caller and owner in the same family unit?
  SELECT fm_caller.family_unit_id, fm_caller.join_date
    INTO v_family_unit_id, v_viewer_join_date
    FROM public.family_members fm_caller
    JOIN public.family_members fm_owner
      ON  fm_owner.family_unit_id = fm_caller.family_unit_id
      AND fm_owner.user_id        = p_owner_id
   WHERE fm_caller.user_id = v_caller
   LIMIT 1;

  -- Not in the same family unit → no cross-user visibility
  IF v_family_unit_id IS NULL THEN RETURN false; END IF;

  IF p_is_shared THEN
    -- Shared row: condition 2 (family member) already satisfied above.
    -- Condition 4: join-date-forward — pre-join Shared rows invisible to later joiner
    IF p_created_date < v_viewer_join_date THEN RETURN false; END IF;
    RETURN true;
  ELSE
    -- Personal row of another family member.
    -- Condition 3 / 5: Mutual Privacy Toggle — OR logic (symmetric by construction).
    --   If EITHER member has hide_personal=true, BOTH members' Personal rows are
    --   hidden from each other (cross-visibility only; owner still sees own Personal via
    --   Condition 1 above).
    SELECT
      (SELECT hide_personal FROM public.family_members
        WHERE family_unit_id = v_family_unit_id AND user_id = v_caller),
      (SELECT hide_personal FROM public.family_members
        WHERE family_unit_id = v_family_unit_id AND user_id = p_owner_id)
    INTO v_caller_hide, v_owner_hide;

    IF COALESCE(v_caller_hide, false) OR COALESCE(v_owner_hide, false) THEN
      RETURN false;
    END IF;

    -- Personal row with no privacy toggle active → partner can see it
    RETURN true;
  END IF;
END;
$$;

-- Allow authenticated users to call the function (SECURITY DEFINER — caller supplies
-- no elevated privilege; the function re-derives auth.uid() internally)
GRANT EXECUTE ON FUNCTION public.auth_can_view_transaction(UUID, BOOLEAN, DATE)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. transactions — replace owner-only SELECT policy with predicate-based policy
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS is already enabled on transactions (migration 0006).
-- Drop the old owner-only SELECT policy; keep INSERT/UPDATE policies intact.
DROP POLICY IF EXISTS transactions_select_owner ON public.transactions;

CREATE POLICY "transaction visibility predicate"
  ON public.transactions
  FOR SELECT TO authenticated
  USING (public.auth_can_view_transaction(user_id, is_shared, date));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. goals — add is_shared column + SELECT policy
-- ─────────────────────────────────────────────────────────────────────────────
-- Add is_shared to goals (Story 7.11 Shared Pooled Goals depends on this foundation).
-- Default false: all existing personal goals remain personal.
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false;

-- Drop old owner-only SELECT policy and replace with one that also permits
-- viewing Shared Goals from a family member.
-- Simplified predicate: owner OR (Shared + same-family + post-join).
-- hide_personal does NOT apply to Shared goals — sharing is explicit opt-in (is_shared=true).
-- Personal goals (is_shared=false) remain owner-only; no cross-partner visibility.
-- Story 7.11 will validate join-date semantics on goals via its own pgTAP suite.
DROP POLICY IF EXISTS goals_select_owner ON public.goals;

CREATE POLICY "goal visibility"
  ON public.goals
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      is_shared = true
      AND EXISTS (
        SELECT 1 FROM public.family_members fm_caller
        JOIN public.family_members fm_owner
          ON  fm_owner.family_unit_id = fm_caller.family_unit_id
          AND fm_owner.user_id        = goals.user_id
        WHERE fm_caller.user_id = auth.uid()
          AND goals.created_at::date >= fm_caller.join_date
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. activity_trail — replace owner-only SELECT policy
-- ─────────────────────────────────────────────────────────────────────────────
-- Partners should see Activity Trail entries for Shared transactions they can view.
-- We join on transactions and apply the predicate there.
DROP POLICY IF EXISTS activity_trail_select_owner ON public.activity_trail;

CREATE POLICY "activity trail visibility"
  ON public.activity_trail
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = activity_trail.transaction_id
        AND public.auth_can_view_transaction(t.user_id, t.is_shared, t.date)
    )
  );
