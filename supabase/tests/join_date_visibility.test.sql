-- Story 7.3: Join-Date-Forward Shared Visibility — invariant tests
-- UUID block: 11111111-7003-4000-8000-* (story 7.3 block per dev-learnings §5 registry)
--   11111111-7003-4000-8000-000000000001 = alice (earlier joiner, join_date 2026-01-01)
--   11111111-7003-4000-8000-000000000002 = bob   (later joiner, join_date 2026-02-01)
--   11111111-7003-4000-8000-000000000010 = family_unit
--   11111111-7003-4000-8000-000000000011 = alice account
--   11111111-7003-4000-8000-000000000012 = bob account
--   11111111-7003-4000-8000-000000000021 = alice Shared tx PRE-JOIN (2026-01-10 < bob join 2026-02-01)
--   11111111-7003-4000-8000-000000000022 = alice Shared tx POST-JOIN (2026-02-05 >= bob join)
--   11111111-7003-4000-8000-000000000023 = alice Personal tx (hidden from bob via hide_personal=true)
--   11111111-7003-4000-8000-000000000024 = bob Shared tx POST-JOIN (2026-02-10 >= alice join)
--
-- Proves the 7.1b predicate works correctly across all AC 13-14 scenarios:
--   V1: alice pre-join Shared → bob sees 0 (direct)
--   V2: alice post-join Shared → bob sees 1 (direct); alice sees 1 (symmetric)
--   V3: alice Personal → bob sees 0 (hide_personal=true; independent of date filter)
--   V4: bob post-join Shared → alice sees 1
--   V5: aggregate COUNT for bob (WHERE user_id=alice AND is_shared=true) = 1 (only post-join)
--   V6: aggregate COUNT for bob (WHERE is_shared=true) = 2 (alice post-join + bob own; pre-join excluded)

BEGIN;

SELECT plan(11);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED (as postgres — bypasses RLS)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE postgres;

-- Users (handle_new_user trigger auto-creates profiles)
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-7003-4000-8000-000000000001', 'alice73@test.com', '{}'),
  ('11111111-7003-4000-8000-000000000002', 'bob73@test.com',   '{}');

-- Default categories for each user (transactions.category_id is NOT NULL)
SELECT public.seed_default_categories('11111111-7003-4000-8000-000000000001');
SELECT public.seed_default_categories('11111111-7003-4000-8000-000000000002');

-- Accounts
INSERT INTO public.accounts (id, user_id, name, type, currency, actual_balance_minor)
VALUES
  ('11111111-7003-4000-8000-000000000011', '11111111-7003-4000-8000-000000000001', 'Alice Cash', 'cash', 'USD', 0),
  ('11111111-7003-4000-8000-000000000012', '11111111-7003-4000-8000-000000000002', 'Bob Cash',   'cash', 'USD', 0);

-- Family: alice joined 2026-01-01 (earlier); bob joined 2026-02-01 (later)
INSERT INTO public.family_units (id)
VALUES ('11111111-7003-4000-8000-000000000010');

INSERT INTO public.family_members (family_unit_id, user_id, join_date, joined_at, hide_personal)
VALUES
  ('11111111-7003-4000-8000-000000000010', '11111111-7003-4000-8000-000000000001', '2026-01-01', '2026-01-01 10:00:00', true),
  ('11111111-7003-4000-8000-000000000010', '11111111-7003-4000-8000-000000000002', '2026-02-01', '2026-02-01 10:00:00', false);

-- alice Shared PRE-JOIN (2026-01-10 — before bob's join_date 2026-02-01)
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-7003-4000-8000-000000000021',
  '11111111-7003-4000-8000-000000000001',
  '11111111-7003-4000-8000-000000000011',
  (SELECT id FROM public.categories WHERE user_id = '11111111-7003-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  1000, '2026-01-10', 'expense', true;

-- alice Shared POST-JOIN (2026-02-05 — after bob's join_date 2026-02-01)
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-7003-4000-8000-000000000022',
  '11111111-7003-4000-8000-000000000001',
  '11111111-7003-4000-8000-000000000011',
  (SELECT id FROM public.categories WHERE user_id = '11111111-7003-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  2000, '2026-02-05', 'expense', true;

-- alice Personal (hide_personal=true so bob cannot see it; date irrelevant)
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-7003-4000-8000-000000000023',
  '11111111-7003-4000-8000-000000000001',
  '11111111-7003-4000-8000-000000000011',
  (SELECT id FROM public.categories WHERE user_id = '11111111-7003-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  3000, '2026-01-10', 'expense', false;

-- bob Shared POST-JOIN (2026-02-10 — after alice's join_date 2026-01-01 AND bob's own join_date)
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-7003-4000-8000-000000000024',
  '11111111-7003-4000-8000-000000000002',
  '11111111-7003-4000-8000-000000000012',
  (SELECT id FROM public.categories WHERE user_id = '11111111-7003-4000-8000-000000000002' AND type = 'expense' LIMIT 1),
  4000, '2026-02-10', 'expense', true;

-- ═══════════════════════════════════════════════════════════════════════════
-- V1: alice pre-join Shared → bob sees 0 (join-date invariant via RLS)
-- ═══════════════════════════════════════════════════════════════════════════
-- Pre-assert: row physically exists (non-vacuous)
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7003-4000-8000-000000000021'),
  1,
  'V1 pre-assert: alice pre-join Shared tx exists'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7003-4000-8000-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7003-4000-8000-000000000021'),
  0,
  'V1: bob cannot see alice Shared tx dated before his join_date'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- V2: alice post-join Shared → visible to both (symmetric)
-- ═══════════════════════════════════════════════════════════════════════════
-- Pre-assert: row exists
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7003-4000-8000-000000000022'),
  1,
  'V2 pre-assert: alice post-join Shared tx exists'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7003-4000-8000-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7003-4000-8000-000000000022'),
  1,
  'V2a: bob sees alice Shared tx dated on/after his join_date'
);

SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7003-4000-8000-000000000001"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7003-4000-8000-000000000022'),
  1,
  'V2b: alice sees own post-join Shared tx (symmetric visibility)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- V3: alice Personal → bob sees 0 (hide_personal=true; independent of dates)
-- ═══════════════════════════════════════════════════════════════════════════
-- Pre-assert: row exists
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7003-4000-8000-000000000023'),
  1,
  'V3 pre-assert: alice Personal tx exists'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7003-4000-8000-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7003-4000-8000-000000000023'),
  0,
  'V3: bob cannot see alice Personal tx when alice.hide_personal=true'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- V4: bob Shared POST-JOIN → alice sees 1
-- ═══════════════════════════════════════════════════════════════════════════
-- Pre-assert: row exists
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7003-4000-8000-000000000024'),
  1,
  'V4 pre-assert: bob post-join Shared tx exists'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7003-4000-8000-000000000001"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7003-4000-8000-000000000024'),
  1,
  'V4: alice sees bob Shared tx dated after alice join_date'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- V5: aggregate — bob view of alice Shared txs = 1 (only post-join from alice)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7003-4000-8000-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE user_id = '11111111-7003-4000-8000-000000000001'
     AND is_shared = true),
  1,
  'V5: bob aggregate of alice Shared txs = 1 (pre-join excluded by RLS predicate)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- V6: aggregate WHERE is_shared=true — pre-join excluded even with explicit filter
-- ═══════════════════════════════════════════════════════════════════════════
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE is_shared = true),
  2,
  'V6: bob Shared bucket = 2 (alice post-join + bob own); pre-join row excluded via RLS'
);

SELECT * FROM finish();

ROLLBACK;
