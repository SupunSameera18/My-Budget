-- pgTAP tests: rpc_reclassify_goal (Task 10 / 0063)
--
-- UUID block 11111111-2013-* (Phase 2 Task 10, goal reclassify):
--   alice (owner, in family): 11111111-2013-4000-8000-000000000001
--   bob (partner):            11111111-2013-4000-8000-000000000002
--   eve (attacker, solo):     11111111-2013-4000-8000-000000000003
--   family_unit:              11111111-2013-4000-8000-000000000010
--   personal goal:            11111111-2013-4000-8000-000000000020
--   shared goal:              11111111-2013-4000-8000-000000000021

BEGIN;

SELECT plan(8);

-- ── Setup ──────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email) VALUES
  ('11111111-2013-4000-8000-000000000001', 'alice_reclassify_goal@test.local'),
  ('11111111-2013-4000-8000-000000000002', 'bob_reclassify_goal@test.local'),
  ('11111111-2013-4000-8000-000000000003', 'eve_reclassify_goal@test.local')
ON CONFLICT (id) DO NOTHING;

-- Family unit: alice + bob
INSERT INTO public.family_units (id)
VALUES ('11111111-2013-4000-8000-000000000010');

INSERT INTO public.family_members (family_unit_id, user_id, join_date) VALUES
  ('11111111-2013-4000-8000-000000000010', '11111111-2013-4000-8000-000000000001', '2026-01-01'),
  ('11111111-2013-4000-8000-000000000010', '11111111-2013-4000-8000-000000000002', '2026-01-01');

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-2013-4000-8000-000000000001"}';

-- Alice's personal goal
INSERT INTO public.goals (id, user_id, name, target_minor, is_shared)
VALUES ('11111111-2013-4000-8000-000000000020', '11111111-2013-4000-8000-000000000001', 'Holiday', 10000, false)
ON CONFLICT (id) DO NOTHING;

-- Alice's shared goal (starts shared for the "personal" direction test)
INSERT INTO public.goals (id, user_id, name, target_minor, is_shared)
VALUES ('11111111-2013-4000-8000-000000000021', '11111111-2013-4000-8000-000000000001', 'Family Trip', 20000, true)
ON CONFLICT (id) DO NOTHING;

-- ── T1: Anti-vacuous — personal goal is_shared = false ───────────────────────

SELECT is(
  (SELECT is_shared FROM public.goals WHERE id = '11111111-2013-4000-8000-000000000020'),
  false,
  'T1: personal goal starts with is_shared = false'
);

-- ── T2: Personal → Shared succeeds when in family ────────────────────────────

SELECT lives_ok(
  $$SELECT public.rpc_reclassify_goal(
    '11111111-2013-4000-8000-000000000020'::UUID, true
  )$$,
  'T2: personal→shared reclassification succeeds for owner in family'
);

-- ── T3: is_shared = true after reclassify to shared ──────────────────────────

SELECT is(
  (SELECT is_shared FROM public.goals WHERE id = '11111111-2013-4000-8000-000000000020'),
  true,
  'T3: is_shared = true after reclassify to shared'
);

-- ── T4: Shared → Personal succeeds (no family check required) ────────────────

SELECT lives_ok(
  $$SELECT public.rpc_reclassify_goal(
    '11111111-2013-4000-8000-000000000021'::UUID, false
  )$$,
  'T4: shared→personal reclassification succeeds for owner'
);

-- ── T5: is_shared = false after reclassify to personal ───────────────────────

SELECT is(
  (SELECT is_shared FROM public.goals WHERE id = '11111111-2013-4000-8000-000000000021'),
  false,
  'T5: is_shared = false after reclassify to personal'
);

-- ── T6: Cross-user — attacker cannot reclassify owner's goal (P0002) ──────────

SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-2013-4000-8000-000000000003"}';

SELECT throws_ok(
  $$SELECT public.rpc_reclassify_goal(
    '11111111-2013-4000-8000-000000000020'::UUID, false
  )$$,
  'P0002',
  NULL::text,
  'T6: attacker cannot reclassify owner''s goal (P0002)'
);

-- ── T7: Solo user cannot reclassify to shared (P0003) ────────────────────────

-- eve (no family membership) tries to reclassify her own goal to shared
SET LOCAL role TO postgres;
INSERT INTO public.goals (id, user_id, name, target_minor, is_shared)
VALUES ('11111111-2013-4000-8000-000000000025', '11111111-2013-4000-8000-000000000003', 'Eve Goal', 5000, false)
ON CONFLICT (id) DO NOTHING;
SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-2013-4000-8000-000000000003"}';

SELECT throws_ok(
  $$SELECT public.rpc_reclassify_goal(
    '11111111-2013-4000-8000-000000000025'::UUID, true
  )$$,
  'P0003',
  NULL::text,
  'T7: solo user cannot reclassify goal to shared (P0003)'
);

-- ── T8: Idempotent — reclassify to same state is a no-op (no error) ───────────

SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-2013-4000-8000-000000000001"}';

SELECT lives_ok(
  $$SELECT public.rpc_reclassify_goal(
    '11111111-2013-4000-8000-000000000020'::UUID, true
  )$$,
  'T8: reclassify to same state is idempotent (no error)'
);

SELECT * FROM finish();
ROLLBACK;
