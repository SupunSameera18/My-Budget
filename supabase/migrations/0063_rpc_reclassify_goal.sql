-- 0063_rpc_reclassify_goal.sql
-- Task 10 (Phase 2): Shared↔Personal Goal reclassification (product decision confirmed)
--
-- rpc_reclassify_goal(p_goal_id UUID, p_to_shared BOOLEAN) RETURNS VOID
--   • Owner-only (caller must own the goal; partner cannot reclassify).
--   • p_to_shared = true  → flip is_shared = true;  caller must be in a family.
--   • p_to_shared = false → flip is_shared = false; no family check required.
--   • Idempotent: no error if already at the target state.
--   • SECURITY DEFINER required to read family_members for both members
--     (owner-only RLS on family_members would block the family check under INVOKER).
--
-- Existing goal_contributions and transaction_splits are not touched;
-- RLS on those tables dynamically re-evaluates is_shared from the goals row.

CREATE OR REPLACE FUNCTION public.rpc_reclassify_goal(
  p_goal_id   UUID,
  p_to_shared BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id  UUID;
  v_is_shared BOOLEAN;
  v_in_family BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Load goal; owner-only check
  SELECT is_shared INTO v_is_shared
  FROM public.goals
  WHERE id          = p_goal_id
    AND user_id     = v_user_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Goal not found, not owned, or archived'
      USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent: already at the target state, nothing to do
  IF v_is_shared = p_to_shared THEN
    RETURN;
  END IF;

  -- To-shared requires caller to be in a family
  IF p_to_shared THEN
    SELECT EXISTS (
      SELECT 1 FROM public.family_members
       WHERE user_id = v_user_id
    ) INTO v_in_family;

    IF NOT v_in_family THEN
      RAISE EXCEPTION 'Cannot share a goal without being in a family'
        USING ERRCODE = 'P0003';
    END IF;
  END IF;

  UPDATE public.goals
  SET updated_at = now(),
      is_shared  = p_to_shared
  WHERE id      = p_goal_id
    AND user_id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_reclassify_goal(uuid, boolean) TO authenticated;
