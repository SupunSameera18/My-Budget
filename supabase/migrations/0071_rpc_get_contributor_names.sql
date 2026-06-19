-- 0071_rpc_get_contributor_names.sql
--
-- Fixes asymmetric display names in Contribution Analysis.
--
-- getContributionAnalysis resolved both contributors' names with a direct
--   SELECT user_id, display_name FROM profiles WHERE user_id IN (...)
-- but the profiles RLS policy only lets a user read their OWN row. So the
-- partner's name always fell back to the generic "Partner" placeholder for
-- every viewer — the page only looked correct when it happened to also pass a
-- partnerName prop (from rpc_get_family_status). The server data itself was
-- wrong, producing "Maya / Partner" instead of "Maya / Sam".
--
-- This SECURITY DEFINER function returns display_name for the caller and the
-- members of the caller's family unit only (and only those columns) — so both
-- partners resolve each other's name without exposing the rest of the profile
-- row. Mirrors the rpc_get_transaction_display_names pattern (0068).

CREATE OR REPLACE FUNCTION public.rpc_get_contributor_names(
  p_user_ids UUID[]
)
RETURNS TABLE(user_id UUID, display_name TEXT)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_unit   UUID;
BEGIN
  IF v_caller IS NULL THEN RETURN; END IF;

  -- The caller's family unit (NULL if solo).
  SELECT fm.family_unit_id INTO v_unit
    FROM public.family_members fm
   WHERE fm.user_id = v_caller
   LIMIT 1;

  RETURN QUERY
    SELECT p.user_id, p.display_name
      FROM public.profiles p
     WHERE p.user_id = ANY(p_user_ids)
       AND (
         p.user_id = v_caller  -- always allowed: self
         OR (
           v_unit IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM public.family_members fm2
              WHERE fm2.user_id = p.user_id
                AND fm2.family_unit_id = v_unit
           )
         )
       );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_contributor_names(UUID[]) TO authenticated;
