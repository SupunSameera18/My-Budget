-- Migration 0033: fix profiles JOIN key and column name in invite RPCs
-- Bug: 0025_invite_codes.sql used p.id (profiles PK, auto-UUID) instead of
--      p.user_id (auth user FK) and p.name instead of p.display_name.
--      Both rpc_preview_invite and rpc_get_family_status were affected,
--      causing "Invite code is invalid or expired" for valid codes and
--      missing partner names in family status.

-- ── rpc_preview_invite (fixed) ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_preview_invite(
  p_code_hash TEXT
) RETURNS TEXT
  SECURITY DEFINER
  SET search_path = public, auth
  LANGUAGE plpgsql
AS $$
DECLARE
  v_caller        UUID := auth.uid();
  v_creator_name  TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(p.display_name, 'Your partner') INTO v_creator_name
    FROM public.invite_codes ic
    JOIN public.profiles p ON p.user_id = ic.creator_id
   WHERE ic.code_hash  = p_code_hash
     AND ic.used_at    IS NULL
     AND ic.revoked_at IS NULL
     AND ic.expires_at > now()
   LIMIT 1;

  RETURN v_creator_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_preview_invite(TEXT) TO authenticated;

-- ── rpc_get_family_status (fixed partner_name lookup) ────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_get_family_status()
RETURNS JSONB
  SECURITY DEFINER
  SET search_path = public, auth
  LANGUAGE plpgsql
AS $$
DECLARE
  v_caller         UUID := auth.uid();
  v_member         RECORD;
  v_member_count   INT;
  v_partner_name   TEXT;
  v_invite         RECORD;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Is the caller in a family_unit?
  SELECT fm.family_unit_id, fm.join_date
    INTO v_member
    FROM public.family_members fm
   WHERE fm.user_id = v_caller
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'solo');
  END IF;

  -- How many members in this family_unit?
  SELECT COUNT(*) INTO v_member_count
   FROM public.family_members
   WHERE family_unit_id = v_member.family_unit_id;

  IF v_member_count >= 2 THEN
    -- Partner exists — find their display name from profiles.
    SELECT COALESCE(p.display_name, 'Your partner') INTO v_partner_name
      FROM public.family_members fm
      JOIN public.profiles p ON p.user_id = fm.user_id
     WHERE fm.family_unit_id = v_member.family_unit_id
       AND fm.user_id        != v_caller
     LIMIT 1;

    RETURN jsonb_build_object(
      'status',         'in_family',
      'family_unit_id', v_member.family_unit_id,
      'partner_name',   COALESCE(v_partner_name, 'Your partner')
    );
  END IF;

  -- Only one member: check for an active invite.
  SELECT id, expires_at, created_at
    INTO v_invite
    FROM public.invite_codes
   WHERE family_unit_id = v_member.family_unit_id
     AND used_at    IS NULL
     AND revoked_at IS NULL
     AND expires_at > now()
   ORDER BY created_at DESC
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

  RETURN jsonb_build_object('status', 'solo');
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_family_status() TO authenticated;
