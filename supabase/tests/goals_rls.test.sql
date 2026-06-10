-- pgTAP cross-user RLS tests for goals + goal_contributions (Story 4.5)
-- User A (owner) UUID:    77777777-7777-4777-8777-777777777777
-- User B (attacker) UUID: 88888888-8888-4888-8888-888888888888

BEGIN;

SELECT plan(8);

-- ── Setup ──────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email)
VALUES
  ('77777777-7777-4777-8777-777777777777', 'owner_goal@test.local'),
  ('88888888-8888-4888-8888-888888888888', 'attacker_goal@test.local')
ON CONFLICT (id) DO NOTHING;

-- Authenticate as User A, create a goal + contribution
SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "77777777-7777-4777-8777-777777777777"}';

INSERT INTO public.goals (id, user_id, name, target_minor)
VALUES ('aa777777-7777-4777-8777-777777777777', '77777777-7777-4777-8777-777777777777', 'Emergency Fund', 500000);

INSERT INTO public.goal_contributions (id, goal_id, user_id, amount_minor, date)
VALUES ('bb777777-7777-4777-8777-777777777777', 'aa777777-7777-4777-8777-777777777777', '77777777-7777-4777-8777-777777777777', 5000, CURRENT_DATE);

-- ── Test 1: Anti-vacuous — User A has 1 goal ──────────────────────────────────
SELECT is(
  (SELECT COUNT(*)::int FROM public.goals WHERE user_id = '77777777-7777-4777-8777-777777777777'),
  1,
  'Anti-vacuous: User A has 1 goal'
);

-- ── Test 2: Anti-vacuous — User A has 1 contribution ─────────────────────────
SELECT is(
  (SELECT COUNT(*)::int FROM public.goal_contributions WHERE goal_id = 'aa777777-7777-4777-8777-777777777777'),
  1,
  'Anti-vacuous: User A has 1 goal contribution'
);

-- ── Switch to User B ──────────────────────────────────────────────────────────
SET LOCAL "request.jwt.claims" TO '{"sub": "88888888-8888-4888-8888-888888888888"}';

-- ── Test 3: User B sees 0 goals ───────────────────────────────────────────────
SELECT is(
  (SELECT COUNT(*)::int FROM public.goals),
  0,
  'User B sees 0 goals (RLS filters User A''s goals)'
);

-- ── Test 4: User B sees 0 goal_contributions ─────────────────────────────────
SELECT is(
  (SELECT COUNT(*)::int FROM public.goal_contributions),
  0,
  'User B sees 0 goal_contributions (RLS filters User A''s contributions)'
);

-- ── Test 5: User B cannot INSERT goal with User A's user_id ──────────────────
SELECT throws_ok(
  $$INSERT INTO public.goals (user_id, name, target_minor)
    VALUES ('77777777-7777-4777-8777-777777777777', 'Attack Goal', 100)$$,
  '42501',
  NULL::text,
  'User B cannot INSERT a goal owned by User A (RLS WITH CHECK violation)'
);

-- ── Test 6: User B cannot INSERT goal_contribution for User A's goal ─────────
-- User B's own user_id satisfies user_id = auth.uid() but the EXISTS check
-- on goals fails because the goal is owned by User A, not User B → 42501.
SELECT throws_ok(
  $$INSERT INTO public.goal_contributions (goal_id, user_id, amount_minor, date)
    VALUES ('aa777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888', 1000, CURRENT_DATE)$$,
  '42501',
  NULL::text,
  'User B cannot INSERT contribution for User A''s goal (RLS WITH CHECK: EXISTS fails)'
);

-- ── Test 7: rpc_contribute_goal as User B raises P0002 ────────────────────────
SELECT throws_ok(
  $$SELECT public.rpc_contribute_goal('aa777777-7777-4777-8777-777777777777'::uuid, 1000, CURRENT_DATE)$$,
  'P0002',
  NULL::text,
  'rpc_contribute_goal as User B for User A''s goal raises P0002 (not owner)'
);

-- ── Test 8: CHECK constraint blocks target_minor = 0 ─────────────────────────
SELECT throws_ok(
  $$INSERT INTO public.goals (user_id, name, target_minor)
    VALUES ('88888888-8888-4888-8888-888888888888', 'Zero Goal', 0)$$,
  '23514',
  NULL::text,
  'CHECK constraint blocks target_minor = 0'
);

SELECT * FROM finish();
ROLLBACK;
