-- Story 7.4: Mutual Privacy Toggle (symmetric)
-- UUID block: 11111111-7004-* (story 7.4 convention, per dev-learnings §20)
--   11111111-7004-4000-8000-000000000001 = alice
--   11111111-7004-4000-8000-000000000002 = bob
--   11111111-7004-4000-8000-000000000010 = family_unit
--   11111111-7004-4000-8000-000000000011 = alice account
--   11111111-7004-4000-8000-000000000012 = bob account
--   11111111-7004-4000-8000-000000000021 = alice Personal tx
--   11111111-7004-4000-8000-000000000022 = bob Personal tx
--
-- Scenarios (AC 4-6):
--   P0: pre-asserts (both Personal rows physically exist)
--   P1: both hide=false → cross-visibility active (AC 5a baseline)
--   P2: alice sets hide=true → both blocked; both see own (AC 4)
--   P3: alice resets to false, bob sets to true → still blocked (AC 5b)
--   P4: both reset to false → cross-visibility restored (AC 5a cycle)

BEGIN;

SELECT plan(16);

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

-- Both members join on the same date so Personal cross-visibility is not affected
-- by the join-date invariant (that is tested in join_date_visibility.test.sql)
INSERT INTO public.family_members (family_unit_id, user_id, join_date, joined_at)
VALUES
  ('11111111-7004-4000-8000-000000000010', '11111111-7004-4000-8000-000000000001', '2026-01-01', '2026-01-01 10:00:00'),
  ('11111111-7004-4000-8000-000000000010', '11111111-7004-4000-8000-000000000002', '2026-01-01', '2026-01-01 10:00:00');

-- alice's Personal tx (is_shared=false)
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-7004-4000-8000-000000000021',
  '11111111-7004-4000-8000-000000000001',
  '11111111-7004-4000-8000-000000000011',
  (SELECT id FROM public.categories WHERE user_id = '11111111-7004-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  1000, '2026-01-10', 'expense', false;

-- bob's Personal tx (is_shared=false)
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
  'P0: alice Personal tx physically exists'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000022'),
  1,
  'P0: bob Personal tx physically exists'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- P1: Both hide=false — cross-visibility active (AC 5a baseline)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7004-4000-8000-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000021'),
  1,
  'P1: bob can see alice Personal when both hide=false'
);

SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7004-4000-8000-000000000001"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000022'),
  1,
  'P1: alice can see bob Personal when both hide=false'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- P2: alice sets hide_personal=true (AC 4)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE postgres;
UPDATE public.family_members
   SET hide_personal = true
 WHERE family_unit_id = '11111111-7004-4000-8000-000000000010'
   AND user_id        = '11111111-7004-4000-8000-000000000001';

-- Pre-asserts (non-vacuous guards for zero-count assertions)
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000021'),
  1,
  'P2 pre-assert: alice Personal tx still physically exists'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000022'),
  1,
  'P2 pre-assert: bob Personal tx still physically exists'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7004-4000-8000-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000021'),
  0,
  'P2: bob cannot see alice Personal when alice.hide_personal=true (AC 4)'
);

SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7004-4000-8000-000000000001"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000022'),
  0,
  'P2: alice cannot see bob Personal when alice.hide_personal=true (symmetric OR, AC 4)'
);

-- Owner always sees own Personal (condition 1 overrides everything)
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000021'),
  1,
  'P2: alice still sees own Personal when hide=true (condition 1, AC 4)'
);

SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7004-4000-8000-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000022'),
  1,
  'P2: bob still sees own Personal when alice.hide_personal=true (condition 1, AC 4)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- P3: alice resets hide=false; bob sets hide=true (AC 5b)
--     Personal rows still blocked because bob.hide_personal=true triggers OR
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE postgres;
UPDATE public.family_members
   SET hide_personal = false
 WHERE family_unit_id = '11111111-7004-4000-8000-000000000010'
   AND user_id        = '11111111-7004-4000-8000-000000000001';

UPDATE public.family_members
   SET hide_personal = true
 WHERE family_unit_id = '11111111-7004-4000-8000-000000000010'
   AND user_id        = '11111111-7004-4000-8000-000000000002';

-- Pre-asserts
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000021'),
  1,
  'P3 pre-assert: alice Personal tx still physically exists'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000022'),
  1,
  'P3 pre-assert: bob Personal tx still physically exists'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7004-4000-8000-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000021'),
  0,
  'P3: bob cannot see alice Personal when bob.hide_personal=true (AC 5b)'
);

SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7004-4000-8000-000000000001"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000022'),
  0,
  'P3: alice cannot see bob Personal when bob.hide_personal=true (OR, AC 5b)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- P4: both reset to false → cross-visibility restored (AC 5a cycle complete)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE postgres;
UPDATE public.family_members
   SET hide_personal = false
 WHERE family_unit_id = '11111111-7004-4000-8000-000000000010';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7004-4000-8000-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000021'),
  1,
  'P4: bob sees alice Personal again when both hide=false (AC 5a cycle)'
);

SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7004-4000-8000-000000000001"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7004-4000-8000-000000000022'),
  1,
  'P4: alice sees bob Personal again when both hide=false (AC 5a cycle)'
);

SELECT * FROM finish();

ROLLBACK;
