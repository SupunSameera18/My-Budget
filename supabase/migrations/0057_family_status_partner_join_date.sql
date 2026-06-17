-- Task 6 (Performance & scalability) — eliminate getTransaction N+1 (deferred 7-8 D1).
--
-- The current rpc_get_family_status returns { status, family_unit_id, partner_name }.
-- getTransaction makes three sequential round-trips to learn the family context:
--   1. rpc_get_family_status            → status + partner_name
--   2. family_members WHERE user_id = me → family_unit_id (already in step 1!)
--   3. family_members WHERE user_id != me AND family_unit_id = X → partner join_date
--
-- Adding partner_join_date to the in_family response collapses all three into one call.
-- The function already has a SECURITY DEFINER + search_path = public, auth context and
-- already reads both family_members rows (v_member + the partner join in the SELECT for
-- v_partner_name), so adding join_date costs one extra column in an already-executed scan.

CREATE OR REPLACE FUNCTION public.rpc_get_family_status()
RETURNS JSONB
  SECURITY DEFINER
  SET search_path = public, auth
  LANGUAGE plpgsql
AS $$
DECLARE
  v_caller              UUID := auth.uid();
  v_member              RECORD;
  v_member_count        INT;
  v_invite              RECORD;
  v_partner_name        TEXT;
  v_partner_join_date   DATE;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('status', 'solo');
  END IF;

  -- Is the caller in any family_unit?
  SELECT * INTO v_member
    FROM public.family_members
   WHERE user_id = v_caller
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'solo');
  END IF;

  -- Count all members in this family_unit.
  SELECT COUNT(*) INTO v_member_count
    FROM public.family_members
   WHERE family_unit_id = v_member.family_unit_id;

  IF v_member_count >= 2 THEN
    -- Partner exists — fetch their display name and join_date in one scan.
    -- Bug fix vs 0025: join on profiles.user_id (not profiles.id) and select
    -- display_name (not the non-existent name column).
    SELECT COALESCE(p.display_name, 'Your partner'), fm.join_date
      INTO v_partner_name, v_partner_join_date
      FROM public.family_members fm
      JOIN public.profiles p ON p.user_id = fm.user_id
     WHERE fm.family_unit_id = v_member.family_unit_id
       AND fm.user_id        != v_caller
     LIMIT 1;

    RETURN jsonb_build_object(
      'status',              'in_family',
      'family_unit_id',      v_member.family_unit_id,
      'partner_name',        COALESCE(v_partner_name, 'Your partner'),
      'partner_join_date',   v_partner_join_date
    );
  END IF;

  -- Only one member: check for an active invite.
  SELECT * INTO v_invite
    FROM public.invite_codes
   WHERE family_unit_id = v_member.family_unit_id
     AND used_at        IS NULL
     AND revoked_at     IS NULL
     AND expires_at     > now()
   LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status',            'has_invite',
      'family_unit_id',    v_member.family_unit_id,
      'invite_id',         v_invite.id,
      'invite_expires_at', v_invite.expires_at,
      'invite_created_at', v_invite.created_at
    );
  END IF;

  -- Family_unit exists but no active invite — show solo CTA so user can generate one.
  RETURN jsonb_build_object('status', 'solo');
END;
$$;

-- GRANT is unchanged — CREATE OR REPLACE preserves existing grants.
GRANT EXECUTE ON FUNCTION public.rpc_get_family_status() TO authenticated;
