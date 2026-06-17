-- 0061_rpc_delete_goal_contribution_set.sql
-- Task 10 (Phase 2): Goal-contribution macro reversal (deferred from Story 5.3)
--
-- Adds:
--   rpc_delete_goal_contribution_set(p_application_id UUID) RETURNS VOID
--     SECURITY DEFINER — goal_contributions has REVOKE DELETE from authenticated,
--     so this function runs as the function owner (postgres) to perform the hard DELETE.
--     Defense-in-depth: verifies all rows in the set belong to auth.uid() before deleting.

CREATE OR REPLACE FUNCTION public.rpc_delete_goal_contribution_set(
  p_application_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_count   INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify the contribution set exists and belongs entirely to the caller.
  -- Also rejects NULL p_application_id (= NULL never matches, v_count = 0).
  SELECT COUNT(*)::int INTO v_count
  FROM public.goal_contributions
  WHERE macro_application_id = p_application_id
    AND user_id = v_user_id;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Contribution set not found or not owned by this user'
      USING ERRCODE = 'P0002';
  END IF;

  -- Hard-delete all contributions in the macro application set.
  -- goal_contributions has REVOKE DELETE from authenticated, so SECURITY DEFINER
  -- is required. The user_id guard ensures we only delete rows the caller owns.
  DELETE FROM public.goal_contributions
  WHERE macro_application_id = p_application_id
    AND user_id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_delete_goal_contribution_set(uuid) TO authenticated;
