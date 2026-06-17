-- 0052_invite_family_hardening.sql
-- Phase 2 Task 3b: invite-code and family-schema security hardening.
--
-- Items closed (see phase-2-implementation-plan.md Task 3b):
--   1. Tighten invite_codes grants to SELECT only — INSERT/UPDATE only ever
--      happen through SECURITY DEFINER RPCs (rpc_generate_invite,
--      rpc_revoke_invite), which run as the function owner and are
--      unaffected by the caller's table grants. The blanket INSERT/UPDATE
--      grant to `authenticated` was unused privilege surface.
--   2. Max-TTL CHECK on invite_codes.expires_at — bounds a code's lifetime
--      to the documented 7-day expiry (PRD FR-45/§4.13 ASSUMPTION) + a
--      1-day grace window for client/server clock skew, defending against
--      a buggy or malicious caller passing an arbitrarily distant expiry.
--   3. CHECK on code_hash length (=64, SHA-256 hex) — the code is always
--      hashed client-side before being sent; this rejects malformed input
--      at the schema level rather than only relying on application code.
--   4. redemption_attempts recording moved OUT of rpc_redeem_invite into a
--      new rpc_record_redemption_attempt(), called as a SEPARATE statement
--      before rpc_redeem_invite. Reason: PostgreSQL statement atomicity —
--      an uncaught exception raised anywhere in a PL/pgSQL function call
--      rolls back EVERY effect of that call, including an INSERT performed
--      earlier in the same function right before `RAISE EXCEPTION`. The
--      original design (migration 0025) did exactly that
--      (`INSERT INTO redemption_attempts ...; RAISE EXCEPTION ...`), so the
--      attempt row was silently rolled back on every single failure path
--      (P0002 included) — the rate limit table was, in practice, never
--      populated by real usage, only by the pgTAP test's direct seed INSERT.
--      Verified empirically (see dev-learnings) before fixing. The fix:
--      record the attempt unconditionally in its own top-level statement
--      (committed independently) BEFORE calling rpc_redeem_invite, which now
--      only reads the table for its rate-limit check and no longer inserts.
--   5. rpc_generate_invite: advisory-lock the caller's user_id for the
--      duration of the transaction before the "find or create family_unit"
--      check — without it, two concurrent calls from the same user (e.g.
--      a double-tap or two browser tabs) can each pass the "no family_unit
--      yet" check and create TWO separate family_units for the same user,
--      since family_members has no UNIQUE(user_id) constraint (only
--      UNIQUE(family_unit_id, user_id)).
--   6. check_family_size() trigger: lock the family_units row (FOR UPDATE)
--      before counting members — the unlocked SELECT COUNT(*) is a
--      classic TOCTOU race that lets two concurrent INSERTs both observe
--      count < 2 and both proceed, producing a 3-member family_unit.
--   7. join_date immutability trigger on family_members — join_date is a
--      privacy-load-bearing value (AR-15 retains it for display/audit even
--      though it no longer gates visibility); nothing should be able to
--      backdate or postdate it after creation via a direct UPDATE.

-- ── 1. Tighten invite_codes grants ───────────────────────────────────────────
REVOKE INSERT, UPDATE ON public.invite_codes FROM authenticated;

-- ── 2 & 3. CHECK constraints on invite_codes ─────────────────────────────────
ALTER TABLE public.invite_codes
  ADD CONSTRAINT invite_codes_expires_at_max_ttl
    CHECK (expires_at <= created_at + INTERVAL '8 days'),
  ADD CONSTRAINT invite_codes_code_hash_length
    CHECK (length(code_hash) = 64);

-- ── 4a. rpc_record_redemption_attempt — always-commits attempt recorder ─────
-- Called as its own top-level statement (separate from rpc_redeem_invite) so
-- the INSERT survives even when the subsequent redeem call raises. See the
-- header comment for why this had to be split out.
CREATE OR REPLACE FUNCTION public.rpc_record_redemption_attempt()
RETURNS void
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.redemption_attempts (user_id) VALUES (v_caller);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_record_redemption_attempt() TO authenticated;

-- ── 4b. rpc_redeem_invite — reads (but no longer writes) redemption_attempts ─
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

  -- Rate limit: max 5 attempts per 15 minutes. The caller is expected to
  -- have already called rpc_record_redemption_attempt() as a separate
  -- statement immediately before this one, so this count includes the
  -- current attempt.
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

-- ── 5. rpc_generate_invite — advisory lock against concurrent duplicate
--      family_units for the same caller ────────────────────────────────────
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

  -- Serialize concurrent calls from the SAME caller for the rest of this
  -- transaction (released automatically at COMMIT/ROLLBACK). hashtext()
  -- collapses the UUID to a single bigint lock key — a same-key collision
  -- with a different user only causes harmless extra serialization, never
  -- an incorrect result, since every check below is still scoped to
  -- v_caller.
  PERFORM pg_advisory_xact_lock(hashtext(v_caller::text));

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

-- ── 6. check_family_size() — lock the family_units row before counting ──────
CREATE OR REPLACE FUNCTION public.check_family_size()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Lock the parent family_units row so two concurrent INSERTs for the same
  -- family_unit_id serialize instead of both observing count < 2 (TOCTOU).
  PERFORM 1 FROM public.family_units WHERE id = NEW.family_unit_id FOR UPDATE;

  IF (
    SELECT COUNT(*)
    FROM public.family_members
    WHERE family_unit_id = NEW.family_unit_id
  ) >= 2 THEN
    RAISE EXCEPTION 'family_unit cannot have more than 2 members'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 7. join_date immutability trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_join_date_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.join_date IS DISTINCT FROM OLD.join_date THEN
    RAISE EXCEPTION 'join_date is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_join_date_immutable ON public.family_members;
CREATE TRIGGER enforce_join_date_immutable
  BEFORE UPDATE ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_join_date_update();

-- ── Explicit anon revokes (defense-in-depth documentation — dev-learnings §12:
--    grants/revokes should always be explicit, never implied) ────────────────
REVOKE ALL ON public.family_units, public.family_members FROM anon;
