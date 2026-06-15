-- rpc_mark_settled.test.sql
-- Story 8.2: Directional Settle-Up Tally & Settle Anytime
--
-- pgTAP UUID block: 11111111-8002-*
--   alice:       11111111-8002-4000-8000-000000000001
--   bob:         11111111-8002-4000-8000-000000000002
--   stranger:    11111111-8002-4000-8000-000000000003
--   family_unit: 11111111-8002-4000-8000-000000000010

BEGIN;

SELECT plan(9);

-- ─── Seed ───────────────────────────────────────────────────────────────────

-- Users
INSERT INTO auth.users (id, email) VALUES
  ('11111111-8002-4000-8000-000000000001', 'alice-8002@test.com'),
  ('11111111-8002-4000-8000-000000000002', 'bob-8002@test.com'),
  ('11111111-8002-4000-8000-000000000003', 'stranger-8002@test.com');

-- Profiles (trigger auto-creates; update currency + onboarding_step)
UPDATE public.profiles SET currency = 'USD', onboarding_step = 5
  WHERE id IN (
    '11111111-8002-4000-8000-000000000001',
    '11111111-8002-4000-8000-000000000002',
    '11111111-8002-4000-8000-000000000003'
  );

-- Family unit
INSERT INTO public.family_units (id) VALUES
  ('11111111-8002-4000-8000-000000000010');

-- Family members (joined 30 days ago so all current-date transactions are post-join)
INSERT INTO public.family_members (family_unit_id, user_id, join_date) VALUES
  ('11111111-8002-4000-8000-000000000010', '11111111-8002-4000-8000-000000000001', current_date - 30),
  ('11111111-8002-4000-8000-000000000010', '11111111-8002-4000-8000-000000000002', current_date - 30);

-- Accounts
INSERT INTO public.accounts (id, user_id, name, type, actual_balance_minor, currency) VALUES
  ('11111111-8002-4000-8000-000000000011', '11111111-8002-4000-8000-000000000001', 'Alice Bank', 'bank', 0, 'USD'),
  ('11111111-8002-4000-8000-000000000012', '11111111-8002-4000-8000-000000000002', 'Bob Bank', 'bank', 0, 'USD');

-- Category for alice (expense, needed for transaction)
INSERT INTO public.categories (id, user_id, name, type) VALUES
  ('11111111-8002-4000-8000-000000000021', '11111111-8002-4000-8000-000000000001', 'Shared Cat', 'expense');

-- A shared transaction owned by alice ($100, alice paid)
INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type, is_shared) VALUES
  ('11111111-8002-4000-8000-000000000030', '11111111-8002-4000-8000-000000000001',
   '11111111-8002-4000-8000-000000000011',
   '11111111-8002-4000-8000-000000000021',
   10000, current_date - 5, 'expense', true);

-- Split: alice is payer, equal split (alice's view: +5000 = bob owes alice)
INSERT INTO public.transaction_splits (transaction_id, payer_id, payer_share_minor, partner_share_minor, split_method) VALUES
  ('11111111-8002-4000-8000-000000000030',
   '11111111-8002-4000-8000-000000000001',
   5000, 5000, 'equal');

-- ─── S1: rpc_mark_settled inserts one row and returns a UUID ─────────────────

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-8002-4000-8000-000000000001"}';

CREATE TEMP TABLE s1_result (settlement_id UUID) ON COMMIT DROP;
GRANT INSERT ON s1_result TO authenticated;
INSERT INTO s1_result SELECT public.rpc_mark_settled('11111111-8002-4000-8000-000000000010'::uuid);

SELECT is(
  (SELECT count(*)::int FROM public.settlements WHERE family_unit_id = '11111111-8002-4000-8000-000000000010'),
  1,
  'S1: rpc_mark_settled inserts exactly one settlements row'
);

SELECT isnt(
  (SELECT settlement_id FROM s1_result),
  NULL::uuid,
  'S1: rpc_mark_settled returns a non-null UUID'
);

-- ─── S2: rpc_settle_up after rpc_mark_settled → tally = 0 ────────────────────

SELECT is(
  public.rpc_settle_up('11111111-8002-4000-8000-000000000010'::uuid),
  0::bigint,
  'S2: rpc_settle_up returns 0 after settlement watermark'
);

-- ─── S3 (idempotency): second call returns same UUID, no new row ──────────────

CREATE TEMP TABLE s3_result (settlement_id UUID) ON COMMIT DROP;
GRANT INSERT ON s3_result TO authenticated;
INSERT INTO s3_result SELECT public.rpc_mark_settled('11111111-8002-4000-8000-000000000010'::uuid);

SELECT is(
  (SELECT count(*)::int FROM public.settlements WHERE family_unit_id = '11111111-8002-4000-8000-000000000010'),
  1,
  'S3: second call does not insert a duplicate row'
);

SELECT is(
  (SELECT settlement_id FROM s3_result),
  (SELECT settlement_id FROM s1_result),
  'S3: second call returns the same UUID as the first'
);

-- ─── S4: stranger calling rpc_mark_settled → raises 42501 ────────────────────

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-8002-4000-8000-000000000003"}';

SELECT throws_ok(
  $$SELECT public.rpc_mark_settled('11111111-8002-4000-8000-000000000010'::uuid)$$,
  '42501',
  NULL::text,
  'S4: stranger calling rpc_mark_settled raises 42501'
);

-- ─── S5: bob (either partner) can call rpc_mark_settled ──────────────────────
-- Remove the current-period settlement so bob can settle a different (next) period.
-- Simulate a new period by deleting the current settlement and advancing the period.
-- We directly delete as postgres to test bob's ability independently.

SET LOCAL role TO postgres;
DELETE FROM public.settlements WHERE family_unit_id = '11111111-8002-4000-8000-000000000010';

-- Add a new unsettled split (bob paid) to give the tally a non-zero value
INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type, is_shared) VALUES
  ('11111111-8002-4000-8000-000000000031', '11111111-8002-4000-8000-000000000001',
   '11111111-8002-4000-8000-000000000011',
   '11111111-8002-4000-8000-000000000021',
   6000, current_date - 3, 'expense', true);

INSERT INTO public.transaction_splits (transaction_id, payer_id, payer_share_minor, partner_share_minor, split_method) VALUES
  ('11111111-8002-4000-8000-000000000031',
   '11111111-8002-4000-8000-000000000002',
   3000, 3000, 'equal');

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-8002-4000-8000-000000000002"}';

CREATE TEMP TABLE s5_result (settlement_id UUID) ON COMMIT DROP;
GRANT INSERT ON s5_result TO authenticated;
INSERT INTO s5_result SELECT public.rpc_mark_settled('11111111-8002-4000-8000-000000000010'::uuid);

SELECT isnt(
  (SELECT settlement_id FROM s5_result),
  NULL::uuid,
  'S5: bob (either partner) can call rpc_mark_settled and receives a UUID'
);

-- ─── S6: zero-tally settlement still creates a record ────────────────────────

-- Remove period settlement; remove splits so tally = 0
SET LOCAL role TO postgres;
DELETE FROM public.settlements WHERE family_unit_id = '11111111-8002-4000-8000-000000000010';
DELETE FROM public.transaction_splits WHERE transaction_id IN (
  '11111111-8002-4000-8000-000000000030',
  '11111111-8002-4000-8000-000000000031'
);

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-8002-4000-8000-000000000001"}';

CREATE TEMP TABLE s6_result (settlement_id UUID) ON COMMIT DROP;
GRANT INSERT ON s6_result TO authenticated;
INSERT INTO s6_result SELECT public.rpc_mark_settled('11111111-8002-4000-8000-000000000010'::uuid);

SELECT isnt(
  (SELECT settlement_id FROM s6_result),
  NULL::uuid,
  'S6: zero-tally rpc_mark_settled still creates a settlement record'
);

SELECT is(
  (SELECT amount_minor FROM public.settlements WHERE family_unit_id = '11111111-8002-4000-8000-000000000010' LIMIT 1),
  0::bigint,
  'S6: zero-tally settlement has amount_minor = 0'
);

SELECT * FROM finish();
ROLLBACK;
