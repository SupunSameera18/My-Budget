-- 0025_invite_codes.sql
-- Epic 7 Story 7.2: invite_codes table, redemption_attempts rate-limit table,
-- and RPCs: rpc_generate_invite, rpc_revoke_invite, rpc_preview_invite,
-- rpc_redeem_invite, rpc_get_family_status.
--
-- Security design:
--   • Raw invite code is NEVER stored — only SHA-256 hash (in server action).
--   • rpc_redeem_invite is SECURITY DEFINER to read invite_codes rows bypassing
--     the creator-only SELECT RLS policy.
--   • rpc_get_family_status is SECURITY DEFINER to count all family_members in
--     a unit (the RLS policy exposes only the caller's own row).
--   • redemption_attempts table tracks failed lookups for rate limiting.

-- ── invite_codes ──────────────────────────────────────────────────────────────
CREATE TABLE public.invite_codes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_unit_id UUID        NOT NULL REFERENCES public.family_units(id),
  creator_id     UUID        NOT NULL REFERENCES auth.users(id),
  code_hash      TEXT        NOT NULL UNIQUE,
  expires_at     TIMESTAMPTZ NOT NULL,
  used_at        TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── redemption_attempts ───────────────────────────────────────────────────────
-- Records each failed redemption lookup for per-user rate limiting.
-- Written exclusively by rpc_redeem_invite (SECURITY DEFINER); no user INSERT policy.
CREATE TABLE public.redemption_attempts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id),
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Table privileges ──────────────────────────────────────────────────────────
-- invite_codes: creator reads/inserts/revoke-updates via RPC or SELECT policy.
-- No UPDATE policy for authenticated — revoke goes through rpc_revoke_invite (SECURITY DEFINER).
GRANT SELECT, INSERT, UPDATE ON public.invite_codes TO authenticated;
REVOKE DELETE, TRUNCATE ON public.invite_codes FROM anon, authenticated;

-- redemption_attempts: only SECURITY DEFINER RPC inserts; authenticated can read own rows.
GRANT SELECT ON public.redemption_attempts TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.redemption_attempts FROM anon, authenticated;

-- ── Row-Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.invite_codes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemption_attempts ENABLE ROW LEVEL SECURITY;

-- Creator sees only their own pending/used/revoked invite codes.
CREATE POLICY "creator sees own invite codes"
  ON public.invite_codes FOR SELECT TO authenticated
  USING (creator_id = auth.uid());

-- User sees their own redemption attempts (for transparency; not strictly needed for RPC).
CREATE POLICY "user sees own redemption attempts"
  ON public.redemption_attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── rpc_generate_invite ───────────────────────────────────────────────────────
-- Creates a family_unit + first member row if the caller has none, then auto-revokes
-- any existing active invite and inserts a new one.
-- Caller passes the pre-hashed code (SHA-256 hex) and the expiry timestamp.
CREATE OR REPLACE FUNCTION public.rpc_generate_invite(
  p_code_hash  TEXT,
  p_expires_at TIMESTAMPTZ
) RETURNS void
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
AS $$
DECLARE
  v_caller         UUID := auth.uid();
  v_family_unit_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Find an existing family_unit for the caller.
  SELECT family_unit_id INTO v_family_unit_id
    FROM public.family_members
   WHERE user_id = v_caller
   LIMIT 1;

  -- No family_unit yet: create one and add caller as the first member.
  IF v_family_unit_id IS NULL THEN
    INSERT INTO public.family_units DEFAULT VALUES
      RETURNING id INTO v_family_unit_id;
    INSERT INTO public.family_members (family_unit_id, user_id, join_date)
      VALUES (v_family_unit_id, v_caller, CURRENT_DATE);
  END IF;

  -- Revoke any existing active invite for this family_unit (one-active-at-a-time rule).
  UPDATE public.invite_codes
     SET revoked_at = now()
   WHERE family_unit_id = v_family_unit_id
     AND used_at    IS NULL
     AND revoked_at IS NULL;

  -- Insert the new invite code.
  INSERT INTO public.invite_codes (family_unit_id, creator_id, code_hash, expires_at)
    VALUES (v_family_unit_id, v_caller, p_code_hash, p_expires_at);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_generate_invite(TEXT, TIMESTAMPTZ) TO authenticated;

-- ── rpc_revoke_invite ─────────────────────────────────────────────────────────
-- Allows the creator to explicitly revoke a pending invite.
CREATE OR REPLACE FUNCTION public.rpc_revoke_invite(
  p_invite_id UUID
) RETURNS void
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
AS $$
DECLARE
  v_caller       UUID := auth.uid();
  v_rows_updated INT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.invite_codes
     SET revoked_at = now()
   WHERE id         = p_invite_id
     AND creator_id = v_caller
     AND used_at    IS NULL
     AND revoked_at IS NULL;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'invite not found or already used/revoked' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_revoke_invite(UUID) TO authenticated;

-- ── rpc_preview_invite ────────────────────────────────────────────────────────
-- Returns the creator's email for a valid (not used/revoked/expired) code hash.
-- Returns NULL if no matching invite found — caller treats NULL as invalid code.
-- SECURITY DEFINER: must read invite_codes rows beyond the caller's creator_id.
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

  SELECT COALESCE(p.name, 'Your partner') INTO v_creator_name
    FROM public.invite_codes ic
    JOIN public.profiles p ON p.id = ic.creator_id
   WHERE ic.code_hash  = p_code_hash
     AND ic.used_at    IS NULL
     AND ic.revoked_at IS NULL
     AND ic.expires_at > now()
   LIMIT 1;

  RETURN v_creator_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_preview_invite(TEXT) TO authenticated;

-- ── rpc_redeem_invite ─────────────────────────────────────────────────────────
-- Validates and redeems an invite code (passed as pre-hashed SHA-256 hex).
-- Rate-limited: max 5 failed attempts per 15 minutes per user.
-- Atomically: marks invite used + inserts caller as second family_member.
-- SECURITY DEFINER: must read invite_codes rows from other creators.
CREATE OR REPLACE FUNCTION public.rpc_redeem_invite(
  p_code_hash TEXT
) RETURNS void
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_invite invite_codes%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Rate limit: max 5 failed attempts per 15 minutes.
  IF (
    SELECT COUNT(*)
      FROM public.redemption_attempts
     WHERE user_id      = v_caller
       AND attempted_at > now() - INTERVAL '15 minutes'
  ) >= 5 THEN
    RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE = 'P0003';
  END IF;

  -- Look up invite by hash (SECURITY DEFINER bypasses creator-only RLS).
  SELECT * INTO v_invite
    FROM public.invite_codes
   WHERE code_hash  = p_code_hash
     AND used_at    IS NULL
     AND revoked_at IS NULL
     AND expires_at > now()
   LIMIT 1;

  IF NOT FOUND THEN
    -- Record failed attempt for rate limiting.
    INSERT INTO public.redemption_attempts (user_id) VALUES (v_caller);
    RAISE EXCEPTION 'invite code not found or expired' USING ERRCODE = 'P0002';
  END IF;

  -- Caller cannot redeem their own invite.
  IF v_invite.creator_id = v_caller THEN
    RAISE EXCEPTION 'cannot redeem own invite' USING ERRCODE = 'P0001';
  END IF;

  -- Caller must not already be in a family.
  IF EXISTS (SELECT 1 FROM public.family_members WHERE user_id = v_caller) THEN
    RAISE EXCEPTION 'already in a family' USING ERRCODE = 'P0004';
  END IF;

  -- Atomically mark the invite used and add the caller to the family.
  -- The ≤2 trigger on family_members will raise 23514 if somehow already full.
  UPDATE public.invite_codes SET used_at = now() WHERE id = v_invite.id;

  INSERT INTO public.family_members (family_unit_id, user_id, join_date, joined_at)
    VALUES (v_invite.family_unit_id, v_caller, CURRENT_DATE, now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_redeem_invite(TEXT) TO authenticated;

-- ── rpc_get_family_status ─────────────────────────────────────────────────────
-- Returns a JSONB object describing the caller's current family state:
--   { "status": "solo" }
--   { "status": "has_invite", "family_unit_id": "...", "invite_id": "...",
--     "invite_expires_at": "...", "invite_created_at": "..." }
--   { "status": "in_family", "family_unit_id": "...", "partner_email": "..." }
-- SECURITY DEFINER: must count all family_members rows for a unit and read
-- invite_codes rows beyond the caller's creator_id.
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
  v_invite         RECORD;
  v_partner_name   TEXT;
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
    -- Partner exists — find their display name from profiles.
    SELECT COALESCE(p.name, 'Your partner') INTO v_partner_name
      FROM public.family_members fm
      JOIN public.profiles p ON p.id = fm.user_id
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

GRANT EXECUTE ON FUNCTION public.rpc_get_family_status() TO authenticated;
