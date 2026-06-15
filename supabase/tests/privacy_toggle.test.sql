-- 0036: Personal Always Private invariant
-- Replaces the Story 7.4 Mutual Privacy Toggle test suite (removed in 0036).
-- The toggle is gone; Personal transactions are unconditionally owner-only.
--
-- UUID block: 11111111-7004-* (story 7.4 convention, per dev-learnings §20)
--   11111111-7004-4000-8000-000000000001 = alice
--   11111111-7004-4000-8000-000000000002 = bob
--   11111111-7004-4000-8000-000000000010 = family_unit
--   11111111-7004-4000-8000-000000000011 = alice account
--   11111111-7004-4000-8000-000000000012 = bob account
--   11111111-7004-4000-8000-000000000021 = alice Personal tx
--   11111111-7004-4000-8000-000000000022 = bob Personal tx
--
-- Scenarios:
--   P0: pre-asserts (both Personal rows physically exist — non-vacuous)
--   P1: bob CANNOT see alice Personal (always blocked, no toggle needed)
--   P2: alice CANNOT see bob Personal (symmetric)
--   P3: each user sees their OWN Personal (owner rule overrides everything)

BEGIN;

SELECT plan(6);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED (as postgres — bypasses RLS)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-7004-4000-8000-000000000001', 'alice-7004@test.com', '{}'),
  ('11111111-7004-4000-8000-000000000002', 'bob-7004@test.com',   '{}');

SELECT public.seed_default_categories('11111111-7004-4000-8000-000000000001');
SELECT public.seed_default_categories('11111111-7004-4000-8000-000000000002');

INSERT INTO public.accounts (id, user_id, name, type, currency, actual_balance_minor)
VALUES
  ('11111111-7004-4000-8000-000000000011', '11111111-7004-4000-8000-000000000001', 'Alice 7004 Cash', 'cash', 'USD', 0),
  ('11111111-7004-4000-8000-000000000012', '11111111-7004-4000-8000-000000000002', 'Bob 7004 Cash',   'cash', 'USD', 0);

INSERT INTO public.family_units (id)
VALUES ('11111111-7004-4000-8000-000000000010');

INSERT INTO public.family_members (family_unit_id, user_id, join_date, joined_at)
VALUES
  ('11111111-7004-4000-8000-000000000010', '11111111-7004-4000-8000-000000000001', '2026-01-01', '2026-01-01 10:00:00'),
  ('11111111-7004-4000-8000-000000000010', '11111111-7004-4000-8000-000000000002', '2026-01-01', '2026-01-01 10:00:00');

INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-7004-4000-8000-000000000021',
  '11111111-7004-4000-8000-000000000001',
  '11111111-7004-4000-8000-000000000011',
  (SELECT id FROM public.categories WHERE user_id = '11111111-7004-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  1000, '2026-01-10', 'expense', false;

INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-7004-4000-8000-000000000022',
  '11111111-7004-4000-8000-000000000002',
  '11111111-7004-4000-8000-000000000012',
  (SELECT id FROM public.categories WHERE user_id = '11111111-7004-4000-8000-000000000002' AND type = 'expense' LIMIT 1),
  2000, '2026-01-15', 'expense', false;

-- ═══════════════════════════════════════════════════════════════════════════
-- P0: Pre-asserts — both Personal rows physically exist (non-vacuous)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000021'),
  1,
  'P0a: alice Personal tx physically exists'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000022'),
  1,
  'P0b: bob Personal tx physically exists'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- P1: bob CANNOT see alice Personal (always blocked — no toggle)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7004-4000-8000-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000021'),
  0,
  'P1: bob cannot see alice Personal (personal is always owner-only)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- P2: alice CANNOT see bob Personal (symmetric)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7004-4000-8000-000000000001"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000022'),
  0,
  'P2: alice cannot see bob Personal (symmetric — personal is always owner-only)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- P3: each user sees their OWN Personal (owner rule, condition 1)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000021'),
  1,
  'P3a: alice sees own Personal (condition 1 — owner always visible)'
);

SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7004-4000-8000-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000022'),
  1,
  'P3b: bob sees own Personal (condition 1 — owner always visible)'
);

SELECT * FROM finish();

ROLLBACK;
