-- Story 7.8: rpc_reclassify_transaction pgTAP tests
-- UUID block: 11111111-7008-4000-8000-* (story number embedded; dev-learnings §22)
--   11111111-7008-4000-8000-000000000001 = alice (transaction owner)
--   11111111-7008-4000-8000-000000000002 = bob   (family partner; joined later)
--   11111111-7008-4000-8000-000000000010 = family_unit
--   11111111-7008-4000-8000-000000000011 = alice account
--   11111111-7008-4000-8000-000000000012 = bob account
--   11111111-7008-4000-8000-000000000021 = tx_pre_join  (alice's personal, date BEFORE bob join)
--   11111111-7008-4000-8000-000000000022 = tx_personal  (alice's personal, date AFTER bob join)
--   11111111-7008-4000-8000-000000000023 = tx_shared    (alice's shared, with existing split)
--
-- Scenarios (AC: 7, 14):
--   P0: pre-asserts — fixture state proven non-vacuous
--   S1: pre-join block — tx_pre_join cannot become Shared (P0003)
--   S2: Personal→Shared allowed — tx_personal flips, split auto-created, trail written
--   S3: Shared→Personal — tx_shared flips, split hard-deleted, trail written
--   S4: AC14 — bob sees 0 rows for tx_shared after S3 reclassification
--   S5: non-owner — bob cannot reclassify alice's tx_personal (42501)
--   S6: already same type — alice tries Personal→Personal on tx_pre_join (P0001)

BEGIN;

SELECT plan(18);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED (as postgres — bypasses RLS)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-7008-4000-8000-000000000001', 'alice-7008@test.com', '{}'),
  ('11111111-7008-4000-8000-000000000002', 'bob-7008@test.com',   '{}');

SELECT public.seed_default_categories('11111111-7008-4000-8000-000000000001');
SELECT public.seed_default_categories('11111111-7008-4000-8000-000000000002');

INSERT INTO public.accounts (id, user_id, name, type, currency, actual_balance_minor)
VALUES
  ('11111111-7008-4000-8000-000000000011', '11111111-7008-4000-8000-000000000001', 'Alice 7008 Cash', 'cash', 'USD', 0),
  ('11111111-7008-4000-8000-000000000012', '11111111-7008-4000-8000-000000000002', 'Bob 7008 Cash',   'cash', 'USD', 0);

INSERT INTO public.family_units (id)
VALUES ('11111111-7008-4000-8000-000000000010');

-- Alice joined first (2026-01-01); Bob joined later (2026-03-01).
-- Alice has hide_personal=true so bob cannot see her personal transactions (AC14 / S4).
INSERT INTO public.family_members (family_unit_id, user_id, join_date, joined_at, hide_personal)
VALUES
  ('11111111-7008-4000-8000-000000000010', '11111111-7008-4000-8000-000000000001', '2026-01-01', '2026-01-01 10:00:00', true),
  ('11111111-7008-4000-8000-000000000010', '11111111-7008-4000-8000-000000000002', '2026-03-01', '2026-03-01 10:00:00', false);

-- tx_pre_join: alice's personal, date BEFORE bob's join_date → pre-join block applies
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-7008-4000-8000-000000000021',
  '11111111-7008-4000-8000-000000000001',
  '11111111-7008-4000-8000-000000000011',
  (SELECT id FROM public.categories WHERE user_id = '11111111-7008-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  2000, '2026-02-01', 'expense', false;

-- tx_personal: alice's personal, date AFTER bob's join_date → reclassification allowed
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-7008-4000-8000-000000000022',
  '11111111-7008-4000-8000-000000000001',
  '11111111-7008-4000-8000-000000000011',
  (SELECT id FROM public.categories WHERE user_id = '11111111-7008-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  1001, '2026-04-01', 'expense', false;

-- tx_shared: alice's shared, date AFTER bob's join_date, with existing split
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-7008-4000-8000-000000000023',
  '11111111-7008-4000-8000-000000000001',
  '11111111-7008-4000-8000-000000000011',
  (SELECT id FROM public.categories WHERE user_id = '11111111-7008-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  800, '2026-04-02', 'expense', true;

INSERT INTO public.transaction_splits
  (transaction_id, payer_id, payer_share_minor, partner_share_minor, split_method)
VALUES
  ('11111111-7008-4000-8000-000000000023',
   '11111111-7008-4000-8000-000000000001',
   400, 400, 'equal');

-- ═══════════════════════════════════════════════════════════════════════════
-- P0: Pre-asserts — fixture state proven non-vacuous (AC: 7 — non-vacuous requirement)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT is(
  (SELECT is_shared FROM public.transactions WHERE id = '11111111-7008-4000-8000-000000000021'),
  false,
  'P0: tx_pre_join starts as personal (is_shared=false)'
);

SELECT is(
  (SELECT is_shared FROM public.transactions WHERE id = '11111111-7008-4000-8000-000000000022'),
  false,
  'P0: tx_personal starts as personal (is_shared=false)'
);

SELECT is(
  (SELECT is_shared FROM public.transactions WHERE id = '11111111-7008-4000-8000-000000000023'),
  true,
  'P0: tx_shared starts as shared (is_shared=true)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S1: Pre-join block — tx_pre_join (dated 2026-02-01) cannot become Shared
--     Bob joined 2026-03-01, so 2026-02-01 < 2026-03-01 → P0003
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7008-4000-8000-000000000001"}';

SELECT throws_ok(
  $$ SELECT public.rpc_reclassify_transaction(
       '11111111-7008-4000-8000-000000000021'::uuid,
       true
     ) $$,
  'P0003', NULL::text,
  'S1: pre-join transaction (2026-02-01 < bob join 2026-03-01) raises P0003'
);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT is_shared FROM public.transactions WHERE id = '11111111-7008-4000-8000-000000000021'),
  false,
  'S1: tx_pre_join is_shared unchanged after P0003 rejection'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S2: Personal → Shared (allowed) — tx_personal (dated 2026-04-01, after bob join)
--     Expect: is_shared=true, split auto-created (equal of 1001 → 501/500), trail written
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7008-4000-8000-000000000001"}';

SELECT public.rpc_reclassify_transaction(
  '11111111-7008-4000-8000-000000000022'::uuid,
  true
);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT is_shared FROM public.transactions WHERE id = '11111111-7008-4000-8000-000000000022'),
  true,
  'S2: tx_personal is_shared flipped to true'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.transaction_splits
   WHERE transaction_id = '11111111-7008-4000-8000-000000000022'),
  1,
  'S2: equal split auto-created for tx_personal'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.activity_trail
   WHERE transaction_id = '11111111-7008-4000-8000-000000000022'
     AND change_type = 'reclassified_to_shared'),
  1,
  'S2: activity_trail entry written (reclassified_to_shared)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S3: Shared → Personal — tx_shared
--     Expect: is_shared=false, split row hard-deleted, trail written
-- ═══════════════════════════════════════════════════════════════════════════

-- Pre-assert: split row exists before the call (non-vacuous)
SELECT is(
  (SELECT COUNT(*)::int FROM public.transaction_splits
   WHERE transaction_id = '11111111-7008-4000-8000-000000000023'),
  1,
  'S3 pre: split exists for tx_shared before reclassification'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7008-4000-8000-000000000001"}';

SELECT public.rpc_reclassify_transaction(
  '11111111-7008-4000-8000-000000000023'::uuid,
  false
);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT is_shared FROM public.transactions WHERE id = '11111111-7008-4000-8000-000000000023'),
  false,
  'S3: tx_shared is_shared flipped to false'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.transaction_splits
   WHERE transaction_id = '11111111-7008-4000-8000-000000000023'),
  0,
  'S3: split row hard-deleted when Shared→Personal'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.activity_trail
   WHERE transaction_id = '11111111-7008-4000-8000-000000000023'
     AND change_type = 'reclassified_to_personal'),
  1,
  'S3: activity_trail entry written (reclassified_to_personal)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S4: AC14 — After Shared→Personal, bob sees 0 rows for tx_shared.
--     alice has hide_personal=true in the fixture, so the RLS predicate returns
--     false for bob on alice's personal rows. This verifies that the is_shared
--     flip correctly withdraws the row from the partner's visible set.
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7008-4000-8000-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = '11111111-7008-4000-8000-000000000023'),
  0,
  'S4: bob sees 0 rows for now-personal tx_shared (RLS blocks partner access)'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.activity_trail
   WHERE transaction_id = '11111111-7008-4000-8000-000000000023'),
  0,
  'S4: bob sees 0 activity_trail rows for now-personal tx_shared'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S5: Non-owner — bob cannot reclassify alice's tx_personal (now shared after S2)
-- ═══════════════════════════════════════════════════════════════════════════

-- Pre-assert: tx_personal is now shared (from S2) — non-vacuous
SET LOCAL ROLE postgres;

SELECT is(
  (SELECT is_shared FROM public.transactions WHERE id = '11111111-7008-4000-8000-000000000022'),
  true,
  'S5 pre: tx_personal is shared (state from S2, non-vacuous pre-assert)'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7008-4000-8000-000000000002"}';

SELECT throws_ok(
  $$ SELECT public.rpc_reclassify_transaction(
       '11111111-7008-4000-8000-000000000022'::uuid,
       false
     ) $$,
  '42501', NULL::text,
  'S5: bob (non-owner) cannot reclassify alice''s transaction → 42501'
);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT is_shared FROM public.transactions WHERE id = '11111111-7008-4000-8000-000000000022'),
  true,
  'S5: tx_personal is_shared unchanged after bob''s failed attempt'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S6: Already same type — alice tries Personal→Personal on tx_pre_join
--     (tx_pre_join is still is_shared=false from P0/S1)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7008-4000-8000-000000000001"}';

SELECT throws_ok(
  $$ SELECT public.rpc_reclassify_transaction(
       '11111111-7008-4000-8000-000000000021'::uuid,
       false
     ) $$,
  'P0001', NULL::text,
  'S6: already-personal tx_pre_join raises P0001 (already that type)'
);

SET LOCAL ROLE postgres;

SELECT * FROM finish();

ROLLBACK;
