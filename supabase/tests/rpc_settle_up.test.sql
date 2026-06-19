-- rpc_settle_up.test.sql
-- Story 8.1: Settle-Up Tally Math — pgTAP suite
-- UUID block: 11111111-8001-4000-8000-* (alice=001, bob=002, stranger=003, family_unit=010)
--
-- Model: "who paid" + 50/50 fair share (migration 0070). A transaction's
-- tally for a viewer is (what they paid) - (their half share); a transaction
-- with no split row counts the owner as having paid the full amount.
--
-- Assertions (11 total):
--   S7: No splits → returns 0
--   S8: Personal transaction (is_shared=false) → excluded from tally
--   S1: Alice (owner paid full) calls rpc_settle_up → positive tally (owed half)
--   S2: Bob (partner paid nothing) calls rpc_settle_up → negative tally (owes half)
--   S3: tally_alice + tally_bob = 0 (conservation law)
--   S4: After watermark inserted, rpc_settle_up returns 0 (split before cutoff)
--   S5: Stranger (non-family-member) calls rpc_settle_up → returns 0
--   S6: Two watermarks — only latest counts; only txns after latest watermark included
--   S9: Stranger cannot SELECT directly from settlements (RLS cross-unit test)
--   S10: Custom who-paid split (alice paid 8000, bob paid 2000 of 10000) → alice +3000
--   S11: Same custom split — bob view is -3000 (conservation)

BEGIN;
SELECT plan(11);

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
-- Seed tx1: shared 10000, alice (owner) paid the full amount, date=2026-05-01
-- who-paid: alice paid 10000, bob paid 0 → fair share 5000 each → alice owed 5000
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
    '11111111-8001-4000-8000-000000000001',  -- alice is payer; alice paid the full 10000
    10000, 0, 'fixed'
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
    5000, 'b_to_a', '2026-05-15T00:00:00Z', '2026-04'
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
    '11111111-8001-4000-8000-000000000002',  -- bob is payer for tx2; bob paid the full 6000
    6000, 0, 'fixed'
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
    '11111111-8001-4000-8000-000000000001',  -- alice is payer for tx3; alice paid the full 4000
    4000, 0, 'fixed'
  );

-- Latest watermark = MAX('2026-05-15', '2026-05-25') = '2026-05-25'
-- tx1 (2026-05-01) → before cutoff → excluded
-- tx2 (2026-05-20) → before cutoff → excluded
-- tx3 (2026-06-01) → after cutoff → alice paid full 4000, fair 2000 → +2000
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-8001-4000-8000-000000000001"}';

SELECT is(
  public.rpc_settle_up('11111111-8001-4000-8000-000000000010'),
  2000::bigint,
  'S6: two watermarks — only splits after 2026-05-25 counted; tx3 (alice paid) → tally +2000'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- S10/S11: Custom who-paid split — the reported scenario.
--   Fresh watermark at 2026-06-05 isolates tx4. alice (owner) logs a 10000 bill
--   and the split records alice paid 8000, bob paid 2000. Fair share is 5000
--   each → alice overpaid by 3000, bob underpaid by 3000 → bob owes alice 3000.
-- ─────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE postgres;

INSERT INTO public.settlements (family_unit_id, settled_by_id, amount_minor, direction, settled_at, period_label)
  VALUES (
    '11111111-8001-4000-8000-000000000010',
    '11111111-8001-4000-8000-000000000001',
    2000, 'b_to_a', '2026-06-05T00:00:00Z', '2026-06'
  );

INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
  VALUES (
    '11111111-8001-4000-8000-000000000034',
    '11111111-8001-4000-8000-000000000001',
    '11111111-8001-4000-8000-000000000020',
    (SELECT id FROM public.categories
     WHERE user_id = '11111111-8001-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
    10000, '2026-06-10', 'expense', true
  );

INSERT INTO public.transaction_splits (transaction_id, payer_id, payer_share_minor, partner_share_minor, split_method)
  VALUES (
    '11111111-8001-4000-8000-000000000034',
    '11111111-8001-4000-8000-000000000001',  -- alice is payer; alice paid 8000, bob paid 2000
    8000, 2000, 'fixed'
  );

CREATE TEMP TABLE tally_s1011 (viewer TEXT, tally BIGINT) ON COMMIT DROP;
GRANT INSERT ON tally_s1011 TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-8001-4000-8000-000000000001"}';
INSERT INTO tally_s1011 VALUES (
  'alice', public.rpc_settle_up('11111111-8001-4000-8000-000000000010')
);
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-8001-4000-8000-000000000002"}';
INSERT INTO tally_s1011 VALUES (
  'bob', public.rpc_settle_up('11111111-8001-4000-8000-000000000010')
);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT tally FROM tally_s1011 WHERE viewer = 'alice'),
  3000::bigint,
  'S10: custom who-paid (alice paid 8000 of 10000, fair 5000) → alice owed 3000'
);

SELECT is(
  (SELECT tally FROM tally_s1011 WHERE viewer = 'bob'),
  -3000::bigint,
  'S11: custom who-paid — bob owes 3000 (conservation: +3000 / -3000)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- S9: Stranger cannot SELECT directly from settlements (RLS cross-unit test)
--     §9 rule: "New table → owner-only RLS + a pgTAP cross-user test"
-- ─────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-8001-4000-8000-000000000003"}';

SELECT is(
  (SELECT count(*)::int FROM public.settlements
   WHERE family_unit_id = '11111111-8001-4000-8000-000000000010'),
  0,
  'S9: stranger cannot read settlements rows — RLS blocks cross-unit SELECT'
);

SELECT * FROM finish();
ROLLBACK;
