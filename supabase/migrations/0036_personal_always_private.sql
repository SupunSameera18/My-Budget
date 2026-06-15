-- 0036_personal_always_private.sql
--
-- Architectural change: Personal transactions are now ALWAYS owner-only.
-- The Mutual Privacy Toggle (hide_personal column + OR-logic in the predicate)
-- is removed. Partners can never see each other's Personal (is_shared=false)
-- transactions regardless of any setting.
--
-- See docs/mutual-privacy-toggle.md for the full removed-feature archive and
-- re-implementation guide.
--
-- Changes:
--   1. auth_can_view_transaction() — Personal branch simplified to RETURN false
--   2. family_members.hide_personal column dropped

-- ── 1. Simplified predicate ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_can_view_transaction(
  p_owner_id     UUID,
  p_is_shared    BOOLEAN,
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
BEGIN
  -- Guard: anonymous callers get nothing
  IF v_caller IS NULL THEN RETURN false; END IF;

  -- Condition 1: own row always visible
  IF p_owner_id = v_caller THEN RETURN true; END IF;

  -- All remaining conditions require a shared-family context.
  SELECT fm_caller.family_unit_id, fm_caller.join_date
    INTO v_family_unit_id, v_viewer_join_date
    FROM public.family_members fm_caller
    JOIN public.family_members fm_owner
      ON  fm_owner.family_unit_id = fm_caller.family_unit_id
      AND fm_owner.user_id        = p_owner_id
   WHERE fm_caller.user_id = v_caller
   LIMIT 1;

  IF v_family_unit_id IS NULL THEN RETURN false; END IF;

  IF p_is_shared THEN
    -- Shared: always visible to family members — no date restriction.
    RETURN true;
  ELSE
    -- Personal: always owner-only. Partners never see personal transactions.
    RETURN false;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auth_can_view_transaction(UUID, BOOLEAN, DATE)
  TO authenticated;

-- ── 2. Drop hide_personal column ─────────────────────────────────────────────
ALTER TABLE public.family_members DROP COLUMN IF EXISTS hide_personal;
