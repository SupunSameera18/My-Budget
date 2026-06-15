-- Story 7.6: rpc_split_transaction pgTAP tests
-- UUID block: 11111111-7006-* (story number embedded; iiiiiiii-* is invalid hex — dev-learnings §22)
--   11111111-7006-4000-8000-000000000001 = alice (transaction owner)
--   11111111-7006-4000-8000-000000000002 = bob   (family partner)
--   11111111-7006-4000-8000-000000000003 = carol (stranger — not in family)
--   11111111-7006-4000-8000-000000000010 = family_unit
--   11111111-7006-4000-8000-000000000011 = alice account
--   11111111-7006-4000-8000-000000000012 = bob account
--   11111111-7006-4000-8000-000000000013 = carol account
--   11111111-7006-4000-8000-000000000021 = shared transaction (amount_minor=1000)
--   11111111-7006-4000-8000-000000000022 = personal transaction (is_shared=false)
--
-- Scenarios (AC 8):
--   P0: pre-asserts (both tx rows physically exist)
--   S1: alice (owner) calls valid equal split → split row stored; payer+partner=1000
--   S2: split amounts not summing to amount_minor → raises 23514
--   S3: personal transaction split attempt → raises P0001
--   S4: carol (stranger, not family member) attempts split → raises 42501
--   S5: upsert — second split call updates existing split record

BEGIN;

SELECT plan(10);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED (as postgres — bypasses RLS)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-7006-4000-8000-000000000001', 'alice-7006@test.com', '{}'),
  ('11111111-7006-4000-8000-000000000002', 'bob-7006@test.com',   '{}'),
  ('11111111-7006-4000-8000-000000000003', 'carol-7006@test.com', '{}');

SELECT public.seed_default_categories('11111111-7006-4000-8000-000000000001');
SELECT public.seed_default_categories('11111111-7006-4000-8000-000000000002');
SELECT public.seed_default_categories('11111111-7006-4000-8000-000000000003');

INSERT INTO public.accounts (id, user_id, name, type, currency, actual_balance_minor)
VALUES
  ('11111111-7006-4000-8000-000000000011', '11111111-7006-4000-8000-000000000001', 'Alice 7006 Cash',  'cash', 'USD', 0),
  ('11111111-7006-4000-8000-000000000012', '11111111-7006-4000-8000-000000000002', 'Bob 7006 Cash',    'cash', 'USD', 0),
  ('11111111-7006-4000-8000-000000000013', '11111111-7006-4000-8000-000000000003', 'Carol 7006 Cash',  'cash', 'USD', 0);

INSERT INTO public.family_units (id)
VALUES ('11111111-7006-4000-8000-000000000010');

INSERT INTO public.family_members (family_unit_id, user_id, join_date, joined_at)
VALUES
  ('11111111-7006-4000-8000-000000000010', '11111111-7006-4000-8000-000000000001', '2026-01-01', '2026-01-01 10:00:00'),
  ('11111111-7006-4000-8000-000000000010', '11111111-7006-4000-8000-000000000002', '2026-01-01', '2026-01-01 10:00:00');

-- carol is NOT a family member (stranger)

-- Shared transaction (alice owns it, dated on/after join date)
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-7006-4000-8000-000000000021',
  '11111111-7006-4000-8000-000000000001',
  '11111111-7006-4000-8000-000000000011',
  (SELECT id FROM public.categories WHERE user_id = '11111111-7006-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  1000, '2026-01-15', 'expense', true;

-- Personal transaction (alice owns it, is_shared=false)
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-7006-4000-8000-000000000022',
  '11111111-7006-4000-8000-000000000001',
  '11111111-7006-4000-8000-000000000011',
  (SELECT id FROM public.categories WHERE user_id = '11111111-7006-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  500, '2026-01-20', 'expense', false;

-- ═══════════════════════════════════════════════════════════════════════════
-- P0: Pre-asserts (non-vacuous guards)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions WHERE id = '11111111-7006-4000-8000-000000000021'),
  1,
  'P0: shared transaction physically exists'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions WHERE id = '11111111-7006-4000-8000-000000000022'),
  1,
  'P0: personal transaction physically exists'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S1: alice calls valid equal split → split row stored; payer+partner=1000
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7006-4000-8000-000000000001"}';

SELECT public.rpc_split_transaction(
  '11111111-7006-4000-8000-000000000021'::uuid,
  'equal',
  '11111111-7006-4000-8000-000000000001'::uuid,
  500::bigint,
  500::bigint
);

-- Verify split row created (as postgres to bypass RLS for assertion)
SET LOCAL ROLE postgres;

SELECT is(
  (SELECT COUNT(*)::int FROM public.transaction_splits
   WHERE transaction_id = '11111111-7006-4000-8000-000000000021'),
  1,
  'S1: split row inserted'
);

SELECT is(
  (SELECT payer_share_minor::int FROM public.transaction_splits
   WHERE transaction_id = '11111111-7006-4000-8000-000000000021'),
  500,
  'S1: payer_share_minor = 500'
);

SELECT is(
  (SELECT (payer_share_minor + partner_share_minor)::int FROM public.transaction_splits
   WHERE transaction_id = '11111111-7006-4000-8000-000000000021'),
  1000,
  'S1: payer + partner = transaction amount_minor (invariant)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S2: Split amounts not summing to amount_minor → raises 23514
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7006-4000-8000-000000000001"}';

SELECT throws_ok(
  $$ SELECT public.rpc_split_transaction(
       '11111111-7006-4000-8000-000000000021'::uuid,
       'fixed',
       '11111111-7006-4000-8000-000000000001'::uuid,
       400::bigint,
       400::bigint
     ) $$,
  '23514', NULL::text,
  'S2: bad split math (400+400 ≠ 1000) raises 23514'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7006-4000-8000-000000000001"}';

-- ═══════════════════════════════════════════════════════════════════════════
-- S3: Personal transaction split attempt → raises P0001
-- ═══════════════════════════════════════════════════════════════════════════
SELECT throws_ok(
  $$ SELECT public.rpc_split_transaction(
       '11111111-7006-4000-8000-000000000022'::uuid,
       'equal',
       '11111111-7006-4000-8000-000000000001'::uuid,
       250::bigint,
       250::bigint
     ) $$,
  'P0001', NULL::text,
  'S3: personal transaction raises P0001'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S4: carol (stranger, not in family) attempts to split → raises 42501
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7006-4000-8000-000000000003"}';

SELECT throws_ok(
  $$ SELECT public.rpc_split_transaction(
       '11111111-7006-4000-8000-000000000021'::uuid,
       'equal',
       '11111111-7006-4000-8000-000000000003'::uuid,
       500::bigint,
       500::bigint
     ) $$,
  '42501', NULL::text,
  'S4: stranger (carol, not family member) cannot split → 42501'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S5: Upsert — bob (partner) re-splits as payer; row updated
--     P2 rule: payer_id must equal authenticated caller, so bob sets himself as payer
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7006-4000-8000-000000000002"}';

SELECT public.rpc_split_transaction(
  '11111111-7006-4000-8000-000000000021'::uuid,
  'percentage',
  '11111111-7006-4000-8000-000000000002'::uuid,
  700::bigint,
  300::bigint
);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT payer_share_minor::int FROM public.transaction_splits
   WHERE transaction_id = '11111111-7006-4000-8000-000000000021'),
  700,
  'S5: upsert updated payer_share_minor to 700'
);

SELECT is(
  (SELECT partner_share_minor::int FROM public.transaction_splits
   WHERE transaction_id = '11111111-7006-4000-8000-000000000021'),
  300,
  'S5: upsert updated partner_share_minor to 300'
);

SELECT * FROM finish();

ROLLBACK;
