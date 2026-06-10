-- pgTAP cross-user RLS tests for budgets + budget_categories (Story 4.1)
-- Owner UUID:   33333333-3333-4333-8333-333333333333
-- Attacker UUID: 44444444-4444-4444-8444-444444444444

BEGIN;

SELECT plan(8);

-- ── Setup ──────────────────────────────────────────────────────────────────────

-- Create two auth users
INSERT INTO auth.users (id, email)
VALUES
  ('33333333-3333-4333-8333-333333333333', 'owner_budget@test.local'),
  ('44444444-4444-4444-8444-444444444444', 'attacker_budget@test.local')
ON CONFLICT (id) DO NOTHING;

-- Grab any category owned by the owner (need a real category_id for budget_categories)
-- Use a default category seeded into the system (seed inserts for user 33333333-*)
-- We'll insert a category directly for the owner
INSERT INTO public.categories (id, user_id, name, type)
VALUES ('cccccccc-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'RLS Test Category', 'expense')
ON CONFLICT (id) DO NOTHING;

-- Authenticate as owner and create a budget
SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "33333333-3333-4333-8333-333333333333"}';

INSERT INTO public.budgets (id, user_id, name, limit_minor, period_type)
VALUES ('bbbbbbbb-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'Owner Budget', 10000, 'monthly');

INSERT INTO public.budget_categories (budget_id, category_id)
VALUES ('bbbbbbbb-3333-4333-8333-333333333333', 'cccccccc-3333-4333-8333-333333333333');

-- ── Test 8 (anti-vacuous precondition) — run BEFORE cross-user tests ──────────

SELECT is(
  (SELECT COUNT(*)::int FROM public.budgets WHERE user_id = '33333333-3333-4333-8333-333333333333'),
  1,
  'Anti-vacuous: owner actually has 1 budget row'
);

-- ── Test 1: Owner can SELECT their own budget ─────────────────────────────────

SELECT is(
  (SELECT COUNT(*)::int FROM public.budgets WHERE id = 'bbbbbbbb-3333-4333-8333-333333333333'),
  1,
  'Owner can SELECT their own budget'
);

-- ── Test 3: Owner can see their own budget_categories ─────────────────────────

SELECT is(
  (SELECT COUNT(*)::int FROM public.budget_categories WHERE budget_id = 'bbbbbbbb-3333-4333-8333-333333333333'),
  1,
  'Owner can SELECT their own budget_categories'
);

-- ── Switch to attacker ────────────────────────────────────────────────────────

SET LOCAL "request.jwt.claims" TO '{"sub": "44444444-4444-4444-8444-444444444444"}';

-- ── Test 2: Attacker sees 0 rows for owner's budget ──────────────────────────

SELECT is(
  (SELECT COUNT(*)::int FROM public.budgets WHERE user_id = '33333333-3333-4333-8333-333333333333'),
  0,
  'Attacker sees 0 rows for owner''s budget'
);

-- ── Test 4: Attacker sees 0 rows in budget_categories for owner's budget ──────

SELECT is(
  (SELECT COUNT(*)::int FROM public.budget_categories WHERE budget_id = 'bbbbbbbb-3333-4333-8333-333333333333'),
  0,
  'Attacker sees 0 rows in budget_categories for owner''s budget'
);

-- ── Test 5: Attacker cannot INSERT into budgets with owner's user_id ──────────
-- RLS WITH CHECK raises 42501 (insufficient_privilege) — ON CONFLICT DO NOTHING
-- does NOT suppress RLS violations; use throws_ok instead.

SELECT throws_ok(
  $$INSERT INTO public.budgets (user_id, name, limit_minor, period_type)
    VALUES ('33333333-3333-4333-8333-333333333333', 'Attack Budget', 100, 'monthly')$$,
  '42501',
  NULL::text,
  'Attacker cannot INSERT a budget owned by User 1 (RLS WITH CHECK violation)'
);

-- ── Test 6: Attacker cannot INSERT into budget_categories for owner's budget ──
-- RLS WITH CHECK evaluates before conflict detection, so this raises 42501.

SELECT throws_ok(
  $$INSERT INTO public.budget_categories (budget_id, category_id)
    VALUES ('bbbbbbbb-3333-4333-8333-333333333333', 'cccccccc-3333-4333-8333-333333333333')$$,
  '42501',
  NULL::text,
  'Attacker cannot INSERT into budget_categories for owner''s budget (RLS WITH CHECK violation)'
);

-- ── Test 7: Negative/zero limit_minor blocked by CHECK constraint ──────────────

SET LOCAL "request.jwt.claims" TO '{"sub": "44444444-4444-4444-8444-444444444444"}';

SELECT throws_ok(
  $$INSERT INTO public.budgets (user_id, name, limit_minor, period_type)
    VALUES ('44444444-4444-4444-8444-444444444444', 'Zero Budget', 0, 'monthly')$$,
  '23514',
  NULL::text,
  'CHECK constraint blocks limit_minor <= 0'
);

SELECT * FROM finish();
ROLLBACK;
