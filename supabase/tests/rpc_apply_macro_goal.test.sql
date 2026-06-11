-- pgTAP golden tests for rpc_apply_macro — goal-targeted branch (Story 5.3)
--
-- UUID registry (bbbbbbbb-* block):
--   Owner:               bbbbbbbb-bbbb-4bbb-8bbb-000000000001
--   Attacker:            bbbbbbbb-bbbb-4bbb-8bbb-000000000002
--   Goal row:            bbbbbbbb-bbbb-4bbb-8bbb-000000000003  (target_minor = 3000)
--   Goal-targeted macro: bbbbbbbb-bbbb-4bbb-8bbb-000000000004  (amount_minor = 5000)
--   Category row:        bbbbbbbb-bbbb-4bbb-8bbb-000000000005
--
-- Note: target_minor = 3000, amount_minor = 5000 — first apply already over-contributes,
--   which lets test 7 verify no cap check without a separate setup apply.

BEGIN;

SELECT plan(11);

-- ── Setup ──────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email) VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 'owner_goal_macro@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000002', 'attacker_goal_macro@test.local')
ON CONFLICT (id) DO NOTHING;

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-000000000001"}';

-- Category (expense — type doesn't affect goal branch but macro requires one)
INSERT INTO public.categories (id, user_id, name, type)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-000000000005', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 'Savings', 'expense')
ON CONFLICT (id) DO NOTHING;

-- Goal (target_minor = 3000; amount_minor = 5000 so first apply over-contributes)
INSERT INTO public.goals (id, user_id, name, target_minor)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-000000000003', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 'Vacation Fund', 3000)
ON CONFLICT (id) DO NOTHING;

-- Goal-targeted macro (goal_id set, account_id null)
INSERT INTO public.macros (id, user_id, name, amount_minor, goal_id, account_id, category_id)
VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000004',
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  'Vacation Save',
  5000,
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000003',
  NULL,
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000005'
)
ON CONFLICT (id) DO NOTHING;

-- ── Test 1: Anti-vacuous — owner has goal-targeted macro ─────────────────────

SELECT is(
  (SELECT COUNT(*)::int FROM public.macros
   WHERE id      = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000004'
     AND user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'),
  1,
  '1: owner has goal-targeted macro'
);

-- ── Apply macro, store result for tests 2–6, 10 ──────────────────────────────

CREATE TEMP TABLE t_goal_apply_result (application_id UUID) ON COMMIT DROP;
INSERT INTO t_goal_apply_result
  SELECT public.rpc_apply_macro('bbbbbbbb-bbbb-4bbb-8bbb-000000000004'::UUID);

-- ── Test 2: rpc_apply_macro returns non-null UUID ────────────────────────────

SELECT ok(
  (SELECT application_id FROM t_goal_apply_result) IS NOT NULL,
  '2: rpc_apply_macro returns non-null UUID for goal-targeted macro'
);

-- ── Test 3: goal_contributions row created with correct fields ───────────────

SELECT is(
  (SELECT COUNT(*)::int FROM public.goal_contributions
   WHERE goal_id      = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000003'
     AND amount_minor = 5000
     AND user_id      = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'),
  1,
  '3: goal_contributions row created with correct goal_id, amount_minor, user_id'
);

-- ── Test 4: macro_application_id set in goal_contributions row ───────────────

SELECT is(
  (SELECT macro_application_id FROM public.goal_contributions
   WHERE goal_id      = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000003'
     AND user_id      = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     AND amount_minor = 5000),
  (SELECT application_id FROM t_goal_apply_result),
  '4: macro_application_id in goal_contributions equals returned UUID'
);

-- ── Test 5: goal progress (sum of contributions) incremented by amount_minor ─
-- goals has no current_amount column; progress is computed as SUM(goal_contributions.amount_minor)

SELECT is(
  (SELECT SUM(amount_minor)::bigint FROM public.goal_contributions
   WHERE goal_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000003'
     AND user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'),
  5000::bigint,
  '5: goal progress (sum of contributions) incremented by 5000'
);

-- ── Test 6: macros.last_used_at is set after apply ───────────────────────────

SELECT ok(
  (SELECT last_used_at IS NOT NULL FROM public.macros
   WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000004'),
  '6: macros.last_used_at is set after rpc_apply_macro'
);

-- ── Test 7: Over-contribution — no error raised ───────────────────────────────
-- First apply already over-contributed (5000 > target_minor 3000).
-- Applying again further over-contributes; no cap check → no error.

SELECT lives_ok(
  $$SELECT public.rpc_apply_macro('bbbbbbbb-bbbb-4bbb-8bbb-000000000004'::UUID)$$,
  '7: over-contribution does not raise an error (no cap check enforced)'
);

-- ── Test 11: p_date forwarded — goal_contributions.date matches supplied p_date ─

CREATE TEMP TABLE t_date_apply (application_id UUID) ON COMMIT DROP;
INSERT INTO t_date_apply
  SELECT public.rpc_apply_macro('bbbbbbbb-bbbb-4bbb-8bbb-000000000004'::UUID, '2026-01-15'::date);

SELECT is(
  (SELECT date FROM public.goal_contributions
   WHERE macro_application_id = (SELECT application_id FROM t_date_apply)),
  '2026-01-15'::date,
  '11: p_date is forwarded to goal_contributions.date'
);

-- ── Test 8: Cross-user — attacker cannot apply owner's macro (P0002) ─────────

SET LOCAL "request.jwt.claims" TO '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-000000000002"}';

SELECT throws_ok(
  $$SELECT public.rpc_apply_macro('bbbbbbbb-bbbb-4bbb-8bbb-000000000004'::UUID)$$,
  'P0002',
  NULL::text,
  '8: cross-user: attacker cannot apply owner''s goal-targeted macro (P0002)'
);

-- ── Test 9: Archived goal-targeted macro raises P0002 ────────────────────────

SET LOCAL role TO postgres;
UPDATE public.macros SET archived_at = NOW() WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000004';

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-000000000001"}';

SELECT throws_ok(
  $$SELECT public.rpc_apply_macro('bbbbbbbb-bbbb-4bbb-8bbb-000000000004'::UUID)$$,
  'P0002',
  NULL::text,
  '9: archived goal-targeted macro raises P0002'
);

-- ── Test 10: No transaction row created for goal-targeted macro apply ─────────

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE macro_application_id = (SELECT application_id FROM t_goal_apply_result)),
  0,
  '10: no transaction row created for goal-targeted macro apply'
);

SELECT * FROM finish();
ROLLBACK;
