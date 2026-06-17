-- pgTAP tests for Story 7.2: invite_codes table, RPCs, RLS, rate limit
-- UUID block: ffffffff-* (reserved for E7 stories 7.2+; see dev-learnings §5)
--   alice: ffffffff-ffff-4fff-8fff-000000000001  (invite creator)
--   bob:   ffffffff-ffff-4fff-8fff-000000000002  (redeemer)
--   carol: ffffffff-ffff-4fff-8fff-000000000003  (rate-limit test user / 3rd-member attempt)

BEGIN;

SELECT plan(26);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED — postgres role bypasses RLS
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('ffffffff-ffff-4fff-8fff-000000000001', 'alice_invite@test.local', '{}'),
  ('ffffffff-ffff-4fff-8fff-000000000002', 'bob_invite@test.local',   '{}'),
  ('ffffffff-ffff-4fff-8fff-000000000003', 'carol_invite@test.local', '{}')
ON CONFLICT (id) DO NOTHING;

-- ── 1–7: Schema shape ────────────────────────────────────────────────────────

SELECT has_table('public', 'invite_codes', 'invite_codes table exists');

SELECT has_column('public', 'invite_codes', 'code_hash',
  'invite_codes.code_hash exists');
SELECT col_not_null('public', 'invite_codes', 'code_hash',
  'invite_codes.code_hash is NOT NULL');

SELECT has_column('public', 'invite_codes', 'expires_at',
  'invite_codes.expires_at exists');
SELECT col_not_null('public', 'invite_codes', 'expires_at',
  'invite_codes.expires_at is NOT NULL');

SELECT has_column('public', 'invite_codes', 'used_at',
  'invite_codes.used_at exists (nullable)');
SELECT has_column('public', 'invite_codes', 'revoked_at',
  'invite_codes.revoked_at exists (nullable)');

-- ═══════════════════════════════════════════════════════════════════════════
-- rpc_generate_invite: creates family_unit + member + invite_codes row
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "ffffffff-ffff-4fff-8fff-000000000001"}';

-- Call generates family_unit, family_member, and invite_codes row for alice.
SELECT public.rpc_generate_invite('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', now() + INTERVAL '7 days');

-- ── 8: invite_codes row exists ───────────────────────────────────────────────
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.invite_codes
    WHERE creator_id = 'ffffffff-ffff-4fff-8fff-000000000001'),
  1,
  'Anti-vacuous: invite_codes row created for alice after rpc_generate_invite'
);

-- ── 9: family_members row created for alice ──────────────────────────────────
SELECT is(
  (SELECT COUNT(*)::int FROM public.family_members
    WHERE user_id = 'ffffffff-ffff-4fff-8fff-000000000001'),
  1,
  'Anti-vacuous: family_members row created for alice (creator) by rpc_generate_invite'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- rpc_redeem_invite: bob redeems alice's code successfully
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "ffffffff-ffff-4fff-8fff-000000000002"}';

SELECT public.rpc_redeem_invite('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

-- ── 10: bob is now in family_members ────────────────────────────────────────
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.family_members
    WHERE user_id = 'ffffffff-ffff-4fff-8fff-000000000002'),
  1,
  'Anti-vacuous: bob in family_members after rpc_redeem_invite'
);

-- ── 11: Used code → P0002 ────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "ffffffff-ffff-4fff-8fff-000000000003"}';

SELECT throws_ok(
  $$SELECT public.rpc_redeem_invite('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')$$,
  'P0002',
  NULL::text,
  'Used code raises P0002'
);

-- ── 12: Expired code → P0002 ─────────────────────────────────────────────────
SET LOCAL ROLE postgres;
INSERT INTO public.invite_codes (family_unit_id, creator_id, code_hash, expires_at)
SELECT
  (SELECT family_unit_id FROM public.family_members
    WHERE user_id = 'ffffffff-ffff-4fff-8fff-000000000001'),
  'ffffffff-ffff-4fff-8fff-000000000001',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  now() - INTERVAL '1 day';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "ffffffff-ffff-4fff-8fff-000000000003"}';

SELECT throws_ok(
  $$SELECT public.rpc_redeem_invite('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')$$,
  'P0002',
  NULL::text,
  'Expired code raises P0002'
);

-- ── 13: Revoked code → P0002 ─────────────────────────────────────────────────
SET LOCAL ROLE postgres;
INSERT INTO public.invite_codes (family_unit_id, creator_id, code_hash, expires_at, revoked_at)
SELECT
  (SELECT family_unit_id FROM public.family_members
    WHERE user_id = 'ffffffff-ffff-4fff-8fff-000000000001'),
  'ffffffff-ffff-4fff-8fff-000000000001',
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  now() + INTERVAL '7 days',
  now();

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "ffffffff-ffff-4fff-8fff-000000000003"}';

SELECT throws_ok(
  $$SELECT public.rpc_redeem_invite('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc')$$,
  'P0002',
  NULL::text,
  'Revoked code raises P0002'
);

-- ── 14: Third-member redemption → 23514 (family already full: alice + bob) ───
-- Insert a fresh valid invite for alice's unit so carol can attempt redemption.
SET LOCAL ROLE postgres;
INSERT INTO public.invite_codes (family_unit_id, creator_id, code_hash, expires_at)
SELECT
  (SELECT family_unit_id FROM public.family_members
    WHERE user_id = 'ffffffff-ffff-4fff-8fff-000000000001'),
  'ffffffff-ffff-4fff-8fff-000000000001',
  'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  now() + INTERVAL '7 days';

-- Carol has no prior redemption_attempts (all throws_ok use savepoints → rolled back),
-- so rate limit passes. The INSERT into family_members hits the ≤2 trigger → 23514.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "ffffffff-ffff-4fff-8fff-000000000003"}';

SELECT throws_ok(
  $$SELECT public.rpc_redeem_invite('dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd')$$,
  '23514',
  NULL::text,
  'Third-member redemption raises 23514 (trigger blocks >2 members)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS: creator sees own codes; another user cannot
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 15: Alice can see her own invite_codes rows ──────────────────────────────
SET LOCAL "request.jwt.claims" TO '{"sub": "ffffffff-ffff-4fff-8fff-000000000001"}';

SELECT isnt(
  (SELECT COUNT(*)::int FROM public.invite_codes
    WHERE creator_id = 'ffffffff-ffff-4fff-8fff-000000000001'),
  0,
  'Anti-vacuous: alice can SELECT her own invite_codes rows'
);

-- ── 16: Carol cannot see alice's invite_codes rows ───────────────────────────
SET LOCAL "request.jwt.claims" TO '{"sub": "ffffffff-ffff-4fff-8fff-000000000003"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.invite_codes
    WHERE creator_id = 'ffffffff-ffff-4fff-8fff-000000000001'),
  0,
  'Carol cannot SELECT alice''s invite_codes rows (RLS blocks cross-user read)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 0052 hardening: CHECK constraints on invite_codes
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE postgres;

-- ── max-TTL CHECK: expires_at more than 8 days past created_at is rejected ───
SELECT throws_ok(
  $$INSERT INTO public.invite_codes (family_unit_id, creator_id, code_hash, expires_at)
    SELECT
      (SELECT family_unit_id FROM public.family_members
        WHERE user_id = 'ffffffff-ffff-4fff-8fff-000000000001'),
      'ffffffff-ffff-4fff-8fff-000000000001',
      repeat('f', 64),
      now() + INTERVAL '30 days'$$,
  '23514',
  NULL::text,
  '0052: expires_at beyond max TTL (8 days) raises 23514'
);

-- ── code_hash length CHECK: anything other than 64 chars is rejected ────────
SELECT throws_ok(
  $$INSERT INTO public.invite_codes (family_unit_id, creator_id, code_hash, expires_at)
    SELECT
      (SELECT family_unit_id FROM public.family_members
        WHERE user_id = 'ffffffff-ffff-4fff-8fff-000000000001'),
      'ffffffff-ffff-4fff-8fff-000000000001',
      'too-short',
      now() + INTERVAL '7 days'$$,
  '23514',
  NULL::text,
  '0052: code_hash with length != 64 raises 23514'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 0052 hardening: rpc_record_redemption_attempt() always commits, even when
-- the subsequent rpc_redeem_invite call raises (split into two statements
-- specifically so the recording survives — see migration 0052 header).
-- ═══════════════════════════════════════════════════════════════════════════

-- Carol (standalone so far) generates her own invite, then tries to redeem
-- her own code → P0001. The attempt must have been recorded by the
-- SEPARATE rpc_record_redemption_attempt() call before the failing call.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "ffffffff-ffff-4fff-8fff-000000000003"}';

SELECT public.rpc_generate_invite(repeat('1', 64), now() + INTERVAL '7 days');

SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.redemption_attempts
   WHERE user_id = 'ffffffff-ffff-4fff-8fff-000000000003'),
  0,
  '0052 pre: carol has no redemption_attempts yet (non-vacuous baseline)'
);

SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.rpc_record_redemption_attempt()$$,
  '0052: rpc_record_redemption_attempt() succeeds for an authenticated caller'
);

SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.redemption_attempts
   WHERE user_id = 'ffffffff-ffff-4fff-8fff-000000000003'),
  1,
  '0052: rpc_record_redemption_attempt() committed a row independently'
);

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.rpc_redeem_invite(repeat('1', 64))$$,
  'P0001',
  NULL::text,
  '0052: redeeming own invite raises P0001'
);

SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.redemption_attempts
   WHERE user_id = 'ffffffff-ffff-4fff-8fff-000000000003'),
  1,
  '0052: the P0001-raising call itself does not add a 2nd row (only the separate recorder call does)'
);

-- Bob (already in alice's family) tries to redeem carol's still-valid code
-- → P0004 (already in a family). The recorder call must persist even
-- though the redeem call that follows raises.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "ffffffff-ffff-4fff-8fff-000000000002"}';

SELECT public.rpc_record_redemption_attempt();

SELECT throws_ok(
  $$SELECT public.rpc_redeem_invite(repeat('1', 64))$$,
  'P0004',
  NULL::text,
  '0052: redeeming when already in a family raises P0004'
);

SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.redemption_attempts
   WHERE user_id = 'ffffffff-ffff-4fff-8fff-000000000002'),
  1,
  '0052: P0004 path records a redemption_attempts row'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Rate limit: 5 failed attempts within 15 minutes → P0003
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 17: P0003 after seeding 5 recent failed attempts ────────────────────────
SET LOCAL ROLE postgres;
INSERT INTO public.redemption_attempts (user_id, attempted_at)
SELECT 'ffffffff-ffff-4fff-8fff-000000000003', now() - INTERVAL '1 minute'
FROM generate_series(1, 5);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "ffffffff-ffff-4fff-8fff-000000000003"}';

SELECT throws_ok(
  $$SELECT public.rpc_redeem_invite('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')$$,
  'P0003',
  NULL::text,
  'Rate limit raises P0003 after 5 failed attempts within 15 minutes'
);

SELECT * FROM finish();
ROLLBACK;
