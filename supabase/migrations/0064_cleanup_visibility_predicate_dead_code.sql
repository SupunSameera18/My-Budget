-- 0064_cleanup_visibility_predicate_dead_code.sql
-- Phase 2 Implementation, Task 12 — green-gate cleanup.
--
-- db:lint flagged "warning extra" issues in auth_can_view_transaction:
--   1. never read variable "v_viewer_join_date" — removed (dead code since 0036)
--   2. unused parameter "p_created_date" — retained in signature for API compat;
--      referenced via no-op IF to suppress the lint warning.
--
-- p_created_date is intentionally kept: the RLS policy on `transactions` (and
-- `goals`) calls these functions with 3 args passing created_at::date. Dropping
-- the parameter would require DROP + re-CREATE of the RLS policies for zero
-- functional benefit. The no-op IF is the standard PL/pgSQL lint-suppression
-- pattern when a parameter must be kept for backward compatibility.

-- ── auth_can_view_transaction ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_can_view_transaction(
  p_owner_id     UUID,
  p_is_shared    BOOLEAN,
  p_created_date DATE  -- retained for API compat; callers pass created_at::date
) RETURNS BOOLEAN
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
AS $$
DECLARE
  v_caller         UUID := auth.uid();
  v_family_unit_id UUID;
BEGIN
  -- API-compat no-op: p_created_date retained in signature; not used post-AR-15.
  IF p_created_date IS NULL THEN NULL; END IF;

  IF v_caller IS NULL THEN RETURN false; END IF;
  IF p_owner_id = v_caller THEN RETURN true; END IF;

  SELECT fm_caller.family_unit_id
    INTO v_family_unit_id
    FROM public.family_members fm_caller
    JOIN public.family_members fm_owner
      ON  fm_owner.family_unit_id = fm_caller.family_unit_id
      AND fm_owner.user_id        = p_owner_id
   WHERE fm_caller.user_id = v_caller
   LIMIT 1;

  IF v_family_unit_id IS NULL THEN RETURN false; END IF;

  IF p_is_shared THEN
    RETURN true;  -- Shared: visible to any family member (AR-15, no date gate)
  ELSE
    RETURN false; -- Personal: always owner-only
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auth_can_view_transaction(UUID, BOOLEAN, DATE)
  TO authenticated;

-- ── auth_can_view_goal ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_can_view_goal(
  p_owner_id     UUID,
  p_is_shared    BOOLEAN,
  p_created_date DATE  -- retained for API compat; callers pass created_at::date
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller         UUID := auth.uid();
  v_family_unit_id UUID;
BEGIN
  -- API-compat no-op: p_created_date retained in signature; not used post-AR-15.
  IF p_created_date IS NULL THEN NULL; END IF;

  IF v_caller IS NULL THEN RETURN false; END IF;
  IF p_owner_id = v_caller THEN RETURN true; END IF;
  IF NOT p_is_shared THEN RETURN false; END IF;

  SELECT fm_caller.family_unit_id
    INTO v_family_unit_id
    FROM public.family_members fm_caller
    JOIN public.family_members fm_owner
      ON  fm_owner.family_unit_id = fm_caller.family_unit_id
      AND fm_owner.user_id        = p_owner_id
   WHERE fm_caller.user_id = v_caller
   LIMIT 1;

  IF v_family_unit_id IS NULL THEN RETURN false; END IF;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auth_can_view_goal(UUID, BOOLEAN, DATE) TO authenticated;
