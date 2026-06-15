-- rpc_settle_up.test.sql
-- Story 8.1: Settle-Up Tally Math — pgTAP suite
-- UUID block: 11111111-8001-4000-8000-* (alice=001, bob=002, stranger=003, family_unit=010)
--
-- Assertions (8 total):
--   S7: No splits → returns 0
--   S8: Personal transaction (is_shared=false) → excluded from tally
--   S1: Alice (payer) calls rpc_settle_up with one equal split → positive tally
--   S2: Bob (non-payer) calls rpc_settle_up → negative tally
--   S3: tally_alice + tally_bob = 0 (conservation law)
--   S4: After watermark inserted, rpc_settle_up returns 0 (split before cutoff)
--   S5: Stranger (non-family-member) calls rpc_settle_up → returns 0
--   S6: Two watermarks — only latest counts; only splits after latest watermark included

BEGIN;
SELECT plan(8);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: users, categories, family unit, account
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('11111111-8001-4000-8000-000000000001', 'alice-8001@example.com'),
  ('11111111-8001-4000-8000-000000000002', 'bob-8001@example.com'),
  ('11111111-8001-4000-8000-000000000003', 'stranger-8001@example.com');

SELECT seed_default_categories('11111111-8001-4000-8000-000000000001');

INSERT INTO public.family_units (id) VALUES ('11111111-8001-4000-8000-000000000010');
INSERT INTO public.family_members (family_unit_id, user_id, join_date) VALUES
  ('11111111-8001-4000-8000-000000000010', '11111111-8001-4000-8000-000000000001', '2026-05-01'),
  ('11111111-8001-4000-8000-000000000010', '11111111-8001-4000-8000-000000000002', '2026-05-01');

INSERT INTO public.accounts (id, user_id, name, type, actual_balance_minor) VALUES
  ('11111111-8001-4000-8000-000000000020', '11111111-8001-4000-8000-000000000001', 'Alice Cash', 'cash', 100000);

-- ─────────────────────────────────────────────────────────────────────────────
-- S7: No splits → rpc_settle_up returns 0
-- ─────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-8001-4000-8000-000000000001"}';

SELECT is(
  public.rpc_settle_up('11111111-8001-4000-8000-000000000010'),
  0::bigint,
  'S7: no splits → rpc_settle_up returns 0'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- S8: Personal transaction (is_shared=false) → excluded from tally
-- ─────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE postgres;

INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
  VALUES (
    '11111111-8001-4000-8000-000000000030',
    '11111111-8001-4000-8000-000000000001',
    '11111111-8001-4000-8000-000000000020',
    (SELECT id FROM public.categories
     WHERE user_id = '11111111-8001-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
    5000, '2026-04-15', 'expense', false
  );
-- No split record for personal transaction

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-8001-4000-8000-000000000001"}';

SELECT is(
  public.rpc_settle_up('11111111-8001-4000-8000-000000000010'),
  0::bigint,
  'S8: personal transaction (is_shared=false) excluded — tally still 0'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed tx1: shared, alice paid 10000 equal, date=2026-05-01
-- ─────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE postgres;

INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
  VALUES (
    '11111111-8001-4000-8000-000000000031',
    '11111111-8001-4000-8000-000000000001',
    '11111111-8001-4000-8000-000000000020',
    (SELECT id FROM public.categories
     WHERE user_id = '11111111-8001-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
    10000, '2026-05-01', 'expense', true
  );

INSERT INTO public.transaction_splits (transaction_id, payer_id, payer_share_minor, partner_share_minor, split_method)
  VALUES (
    '11111111-8001-4000-8000-000000000031',
    '11111111-8001-4000-8000-000000000001',  -- alice is payer
    5000, 5000, 'equal'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- S1, S2, S3: Capture both tallies for conservation law check
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE tally_s123 (viewer TEXT, tally BIGINT) ON COMMIT DROP;
GRANT INSERT ON tally_s123 TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-8001-4000-8000-000000000001"}';
INSERT INTO tally_s123 VALUES (
  'alice',
  public.rpc_settle_up('11111111-8001-4000-8000-000000000010')
);

SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-8001-4000-8000-000000000002"}';
INSERT INTO tally_s123 VALUES (
  'bob',
  public.rpc_settle_up('11111111-8001-4000-8000-000000000010')
);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT tally FROM tally_s123 WHERE viewer = 'alice'),
  5000::bigint,
  'S1: alice (payer) tally is +5000 — owed by partner'
);

SELECT is(
  (SELECT tally FROM tally_s123 WHERE viewer = 'bob'),
  -5000::bigint,
  'S2: bob (non-payer) tally is -5000 — owes alice'
);

SELECT is(
  (SELECT tally FROM tally_s123 WHERE viewer = 'alice') +
  (SELECT tally FROM tally_s123 WHERE viewer = 'bob'),
  0::bigint,
  'S3: conservation law — alice tally + bob tally = 0'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- S4: After watermark at 2026-05-15, rpc_settle_up returns 0
--     (tx1 date 2026-05-01 is before the cutoff)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.settlements (family_unit_id, settled_by_id, amount_minor, direction, settled_at, period_label)
  VALUES (
    '11111111-8001-4000-8000-000000000010',
    '11111111-8001-4000-8000-000000000001',
    5000, 'b_to_a', '2026-05-15T00:00:00Z', '2026-05'
  );

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-8001-4000-8000-000000000001"}';

SELECT is(
  public.rpc_settle_up('11111111-8001-4000-8000-000000000010'),
  0::bigint,
  'S4: after watermark at 2026-05-15, rpc_settle_up returns 0 (tx1 is before cutoff)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- S5: Stranger returns 0 (hides family unit existence — not a 42501 error)
-- ─────────────────────────────────────────────────────────────────────────────
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-8001-4000-8000-000000000003"}';

SELECT is(
  public.rpc_settle_up('11111111-8001-4000-8000-000000000010'),
  0::bigint,
  'S5: stranger returns 0 (not 42501 — existence of family unit is hidden)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- S6: Two watermarks — only latest counts
--     tx2 (2026-05-20) is between watermark1 and watermark2 → excluded
--     tx3 (2026-06-01) is after watermark2 (2026-05-25) → included
-- ─────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE postgres;

-- tx2: shared, alice's account, bob is payer, date=2026-05-20
INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
  VALUES (
    '11111111-8001-4000-8000-000000000032',
    '11111111-8001-4000-8000-000000000001',
    '11111111-8001-4000-8000-000000000020',
    (SELECT id FROM public.categories
     WHERE user_id = '11111111-8001-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
    6000, '2026-05-20', 'expense', true
  );

INSERT INTO public.transaction_splits (transaction_id, payer_id, payer_share_minor, partner_share_minor, split_method)
  VALUES (
    '11111111-8001-4000-8000-000000000032',
    '11111111-8001-4000-8000-000000000002',  -- bob is payer for tx2
    3000, 3000, 'equal'
  );

-- Watermark2 at 2026-05-25 (after tx2, before tx3)
INSERT INTO public.settlements (family_unit_id, settled_by_id, amount_minor, direction, settled_at, period_label)
  VALUES (
    '11111111-8001-4000-8000-000000000010',
    '11111111-8001-4000-8000-000000000002',
    3000, 'a_to_b', '2026-05-25T00:00:00Z', '2026-05'
  );

-- tx3: shared, alice's account, alice is payer, date=2026-06-01 (after watermark2)
INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
  VALUES (
    '11111111-8001-4000-8000-000000000033',
    '11111111-8001-4000-8000-000000000001',
    '11111111-8001-4000-8000-000000000020',
    (SELECT id FROM public.categories
     WHERE user_id = '11111111-8001-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
    4000, '2026-06-01', 'expense', true
  );

INSERT INTO public.transaction_splits (transaction_id, payer_id, payer_share_minor, partner_share_minor, split_method)
  VALUES (
    '11111111-8001-4000-8000-000000000033',
    '11111111-8001-4000-8000-000000000001',  -- alice is payer for tx3
    2000, 2000, 'equal'
  );

-- Latest watermark = MAX('2026-05-15', '2026-05-25') = '2026-05-25'
-- tx1 (2026-05-01) → before cutoff → excluded
-- tx2 (2026-05-20) → before cutoff → excluded
-- tx3 (2026-06-01) → after cutoff → alice paid → +2000
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-8001-4000-8000-000000000001"}';

SELECT is(
  public.rpc_settle_up('11111111-8001-4000-8000-000000000010'),
  2000::bigint,
  'S6: two watermarks — only splits after 2026-05-25 counted; tx3 (alice paid) → tally +2000'
);

SELECT * FROM finish();
ROLLBACK;
