-- Migration 0035: correct auth_can_view_transaction personal branch
--
-- Migration 0034 incorrectly added a join-date filter to the Personal
-- (mutual sharing ON) branch. The correct rules are:
--
--   Shared                    → always visible to family member (no date rule)
--   Personal, sharing ON      → always visible (no date rule)
--   Personal, sharing OFF     → never visible
--
-- Only the Shared branch needed its join-date restriction removed (done in 0034).
-- The Personal branch is unchanged from the original 0024 predicate.

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
  v_caller           UUID := auth.uid();
  v_family_unit_id   UUID;
  v_viewer_join_date DATE;
  v_caller_hide      BOOLEAN;
  v_owner_hide       BOOLEAN;
BEGIN
  -- Guard: anonymous callers get nothing
  IF v_caller IS NULL THEN RETURN false; END IF;

  -- Condition 1: own row always visible
  IF p_owner_id = v_caller THEN RETURN true; END IF;

  -- Establish: are caller and owner in the same family unit?
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
    -- Shared: always visible to family members — no date restriction.
    RETURN true;
  ELSE
    -- Personal: visible only when mutual sharing is ON for both members.
    -- No date restriction — all personal transactions are equally visible
    -- when sharing is enabled.
    SELECT
      (SELECT hide_personal FROM public.family_members
        WHERE family_unit_id = v_family_unit_id AND user_id = v_caller),
      (SELECT hide_personal FROM public.family_members
        WHERE family_unit_id = v_family_unit_id AND user_id = p_owner_id)
    INTO v_caller_hide, v_owner_hide;

    IF COALESCE(v_caller_hide, false) OR COALESCE(v_owner_hide, false) THEN
      RETURN false;
    END IF;

    RETURN true;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auth_can_view_transaction(UUID, BOOLEAN, DATE)
  TO authenticated;
