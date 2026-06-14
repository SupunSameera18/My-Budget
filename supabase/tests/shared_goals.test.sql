-- shared_goals.test.sql
-- Story 7.11: Shared Pooled Goals — pgTAP suite
-- UUID block: 11111111-7011-4000-8000-* (alice=001, bob=002)

BEGIN;
SELECT plan(16);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: alice (goal owner) and bob (family partner)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('11111111-7011-4000-8000-000000000001', 'alice-7011@example.com'),
  ('11111111-7011-4000-8000-000000000002', 'bob-7011@example.com');

SELECT seed_default_categories('11111111-7011-4000-8000-000000000001');
SELECT seed_default_categories('11111111-7011-4000-8000-000000000002');

-- Form a family unit
INSERT INTO public.family_units (id) VALUES ('11111111-7011-4000-8000-000000000010');
INSERT INTO public.family_members (family_unit_id, user_id, join_date) VALUES
  ('11111111-7011-4000-8000-000000000010', '11111111-7011-4000-8000-000000000001', '2026-06-01'),
  ('11111111-7011-4000-8000-000000000010', '11111111-7011-4000-8000-000000000002', '2026-06-05');

-- Seed goals as alice (postgres role to bypass RLS)
INSERT INTO public.goals (id, user_id, name, target_minor, is_shared) VALUES
  ('11111111-7011-4000-8000-000000000020', '11111111-7011-4000-8000-000000000001', 'Holiday Fund', 200000, true),
  ('11111111-7011-4000-8000-000000000021', '11111111-7011-4000-8000-000000000001', 'Alice Personal', 100000, false);

-- Pre-assert: goals exist
SELECT is(
  (SELECT COUNT(*)::int FROM public.goals WHERE user_id = '11111111-7011-4000-8000-000000000001'),
  2,
  'T0: alice has 2 goals seeded'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T1: bob can read alice's Shared Goal via RLS
-- ─────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7011-4000-8000-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.goals WHERE id = '11111111-7011-4000-8000-000000000020'),
  1,
  'T1: bob can read alice Shared Goal via RLS'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T2: bob cannot read alice's Personal Goal via RLS
-- ─────────────────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT COUNT(*)::int FROM public.goals WHERE id = '11111111-7011-4000-8000-000000000021'),
  0,
  'T2: bob cannot read alice Personal Goal'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T3: bob can contribute to alice's Shared Goal via rpc_contribute_goal
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE contrib_result (contrib_id uuid) ON COMMIT DROP;
INSERT INTO contrib_result
  SELECT public.rpc_contribute_goal('11111111-7011-4000-8000-000000000020', 5000, '2026-06-06');

SELECT isnt(
  (SELECT contrib_id FROM contrib_result),
  NULL,
  'T3: rpc_contribute_goal returns a contribution id for partner'
);

-- Pre-assert contribution was actually inserted
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.goal_contributions
   WHERE goal_id = '11111111-7011-4000-8000-000000000020'
     AND user_id = '11111111-7011-4000-8000-000000000002'),
  1,
  'T3b: bob contribution row inserted in goal_contributions'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T4: bob can read his own contribution and alice's post-join contribution
--     (RLS: own contributions always visible; partner post-join also visible)
-- ─────────────────────────────────────────────────────────────────────────────

-- Seed alice's contributions: one pre-join (2026-05-30) and one post-join (2026-06-06)
INSERT INTO public.goal_contributions (goal_id, user_id, amount_minor, date) VALUES
  ('11111111-7011-4000-8000-000000000020', '11111111-7011-4000-8000-000000000001', 10000, '2026-05-30'),
  ('11111111-7011-4000-8000-000000000020', '11111111-7011-4000-8000-000000000001', 8000, '2026-06-06');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7011-4000-8000-000000000002"}';

-- bob's join_date = 2026-06-05; should see: own (5000) + alice post-join (8000) = 2 rows, NOT alice pre-join
SELECT is(
  (SELECT COUNT(*)::int FROM public.goal_contributions
   WHERE goal_id = '11111111-7011-4000-8000-000000000020'),
  2,
  'T4: bob sees own contribution + alice post-join contribution (not pre-join)'
);

SELECT is(
  (SELECT COALESCE(SUM(amount_minor), 0)::bigint FROM public.goal_contributions
   WHERE goal_id = '11111111-7011-4000-8000-000000000020'),
  13000::bigint,
  'T4b: pooled progress for bob = 5000 (bob) + 8000 (alice post-join)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T5: alice sees all her own contributions + bob's post-join contribution
--     alice join_date = 2026-06-01; bob contribution date = 2026-06-06 (post alice join)
-- ─────────────────────────────────────────────────────────────────────────────
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7011-4000-8000-000000000001"}';

-- alice sees: own pre-join (10000) + own post-join (8000) + bob post-join (5000) = 3 rows
SELECT is(
  (SELECT COUNT(*)::int FROM public.goal_contributions
   WHERE goal_id = '11111111-7011-4000-8000-000000000020'),
  3,
  'T5: alice sees all own contributions + bob post-join contribution'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T6: rpc_contribute_goal on Personal Goal raises P0001
-- ─────────────────────────────────────────────────────────────────────────────
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7011-4000-8000-000000000002"}';

SELECT throws_ok(
  $$SELECT public.rpc_contribute_goal('11111111-7011-4000-8000-000000000021', 1000, '2026-06-06')$$,
  'P0001',
  NULL::text,
  'T6: partner contributing to Personal Goal raises P0001'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T7: stranger cannot read alice's Shared Goal
-- ─────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE postgres;
INSERT INTO auth.users (id, email) VALUES
  ('11111111-7011-4000-8000-000000000003', 'stranger-7011@example.com');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7011-4000-8000-000000000003"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.goals WHERE id = '11111111-7011-4000-8000-000000000020'),
  0,
  'T7: stranger cannot read alice Shared Goal'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T8: stranger cannot contribute to alice's Shared Goal (not a family member)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$SELECT public.rpc_contribute_goal('11111111-7011-4000-8000-000000000020', 1000, '2026-06-06')$$,
  '42501',
  NULL::text,
  'T8: stranger contributing to Shared Goal raises 42501'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T8b: stranger cannot INSERT directly into goal_contributions for alice's Shared Goal
--      Tests RLS WITH CHECK — distinct from the RPC path in T8
-- ─────────────────────────────────────────────────────────────────────────────
-- Pre-assert: stranger has no existing contributions (non-vacuous)
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.goal_contributions
   WHERE user_id = '11111111-7011-4000-8000-000000000003'),
  0,
  'T8b pre-assert: stranger has no contributions'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7011-4000-8000-000000000003"}';

SELECT throws_ok(
  $$INSERT INTO public.goal_contributions (goal_id, user_id, amount_minor, date)
    VALUES ('11111111-7011-4000-8000-000000000020',
            '11111111-7011-4000-8000-000000000003',
            1000, '2026-06-06')$$,
  NULL::text,
  NULL::text,
  'T8b: stranger direct INSERT into goal_contributions for Shared Goal is blocked by RLS'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T9: rpc_create_goal with p_is_shared=true creates a Shared Goal
-- ─────────────────────────────────────────────────────────────────────────────
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7011-4000-8000-000000000001"}';

CREATE TEMP TABLE new_goal_result (goal_id uuid) ON COMMIT DROP;
INSERT INTO new_goal_result SELECT public.rpc_create_goal('Shared Holiday', 50000, true);

SELECT isnt(
  (SELECT goal_id FROM new_goal_result),
  NULL,
  'T9: rpc_create_goal with is_shared=true returns a goal id'
);

SET LOCAL ROLE postgres;
SELECT is(
  (SELECT is_shared FROM public.goals WHERE id = (SELECT goal_id FROM new_goal_result)),
  true,
  'T9b: created goal has is_shared=true in DB'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T10: rpc_create_goal default (no p_is_shared) creates a Personal Goal
-- ─────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7011-4000-8000-000000000001"}';

CREATE TEMP TABLE personal_goal_result (goal_id uuid) ON COMMIT DROP;
INSERT INTO personal_goal_result SELECT public.rpc_create_goal('Personal Savings', 30000);

SET LOCAL ROLE postgres;
SELECT is(
  (SELECT is_shared FROM public.goals WHERE id = (SELECT goal_id FROM personal_goal_result)),
  false,
  'T10: rpc_create_goal with default creates Personal Goal (is_shared=false)'
);

SELECT * FROM finish();
ROLLBACK;
