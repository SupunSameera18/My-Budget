-- rpc_mark_settled.test.sql
-- Story 8.2: Directional Settle-Up Tally & Settle Anytime
--
-- pgTAP UUID block: 11111111-8002-*
--   alice:       11111111-8002-4000-8000-000000000001
--   bob:         11111111-8002-4000-8000-000000000002
--   stranger:    11111111-8002-4000-8000-000000000003
--   family_unit: 11111111-8002-4000-8000-000000000010

BEGIN;

SELECT plan(13);

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

-- Who-paid split (migration 0070): payer_share/partner_share record who ACTUALLY
-- paid. Alice fronted the whole 10000 (alice paid 10000, bob paid 0); fair share
-- is 5000 each, so alice is +5000 → bob owes alice 5000.
INSERT INTO public.transaction_splits (transaction_id, payer_id, payer_share_minor, partner_share_minor, split_method) VALUES
  ('11111111-8002-4000-8000-000000000030',
   '11111111-8002-4000-8000-000000000001',
   10000, 0, 'fixed');

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

-- Add a new unsettled shared transaction where bob fronted the whole 6000
-- (bob paid 6000, alice paid 0). Bob is the payer; partner_share is alice's
-- 0 contribution. Bob's fair share is 3000, so bob is +3000 → non-zero tally.
INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type, is_shared) VALUES
  ('11111111-8002-4000-8000-000000000031', '11111111-8002-4000-8000-000000000001',
   '11111111-8002-4000-8000-000000000011',
   '11111111-8002-4000-8000-000000000021',
   6000, current_date - 3, 'expense', true);

INSERT INTO public.transaction_splits (transaction_id, payer_id, payer_share_minor, partner_share_minor, split_method) VALUES
  ('11111111-8002-4000-8000-000000000031',
   '11111111-8002-4000-8000-000000000002',
   6000, 0, 'fixed');

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

-- ─── S6: zero-tally rpc_mark_settled raises P0001 ─────────────────────────────
-- (Phase 2 review patch D1: settling a zero-balance period is a no-op guard)

-- Remove the settlement and archive every shared transaction so the tally is 0.
-- (Under the who-paid model just deleting splits is NOT enough — a split-less
-- shared transaction falls back to "owner paid the full amount", which is still
-- a non-zero contribution. Archiving removes it from rpc_settle_up entirely.)
SET LOCAL role TO postgres;
DELETE FROM public.settlements WHERE family_unit_id = '11111111-8002-4000-8000-000000000010';
UPDATE public.transactions SET archived_at = now()
 WHERE id IN (
  '11111111-8002-4000-8000-000000000030',
  '11111111-8002-4000-8000-000000000031'
);

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-8002-4000-8000-000000000001"}';

SELECT throws_ok(
  $$ SELECT public.rpc_mark_settled('11111111-8002-4000-8000-000000000010'::uuid) $$,
  'P0001', NULL::text,
  'S6: zero-tally rpc_mark_settled raises P0001 (cannot settle a zero-balance period)'
);

-- ─── S7 (settle-anytime, migration 0078): a deliberate re-settle in the SAME
--     period writes a NEW watermark and resets the tally to 0 ─────────────────
-- Regression for "second settle in the same month silently no-ops": before 0078
-- the per-month idempotency returned the first watermark and wrote nothing, so
-- the tally never reset even though the toast claimed success.

SET LOCAL role TO postgres;
-- Clean slate: no settlements; revive tx030 as the only live shared spend and
-- keep tx031 archived (from S6). Alice fronted the whole 10000 → alice +5000.
DELETE FROM public.settlements WHERE family_unit_id = '11111111-8002-4000-8000-000000000010';
DELETE FROM public.transaction_splits WHERE transaction_id IN (
  '11111111-8002-4000-8000-000000000030',
  '11111111-8002-4000-8000-000000000031'
);
UPDATE public.transactions SET archived_at = NULL  WHERE id = '11111111-8002-4000-8000-000000000030';
UPDATE public.transactions SET archived_at = now() WHERE id = '11111111-8002-4000-8000-000000000031';

INSERT INTO public.transaction_splits (transaction_id, payer_id, payer_share_minor, partner_share_minor, split_method) VALUES
  ('11111111-8002-4000-8000-000000000030',
   '11111111-8002-4000-8000-000000000001',
   10000, 0, 'fixed');

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-8002-4000-8000-000000000001"}';

-- First settle in the period → one watermark, tally resets.
CREATE TEMP TABLE s7_first (settlement_id UUID) ON COMMIT DROP;
GRANT INSERT ON s7_first TO authenticated;
INSERT INTO s7_first SELECT public.rpc_mark_settled('11111111-8002-4000-8000-000000000010'::uuid);

-- Backdate the first watermark by an hour. Inside this single test transaction
-- now() is frozen, so without backdating the next transaction's created_at would
-- equal settled_at and fall on the wrong side of the `created_at > cutoff`
-- boundary. Backdating reproduces real time passing between two settles.
SET LOCAL role TO postgres;
UPDATE public.settlements
   SET settled_at = now() - interval '1 hour'
 WHERE id = (SELECT settlement_id FROM s7_first);

-- New shared spend logged AFTER the first watermark but before now()
-- (created_at = now() - 30 min  ⇒  inside the unsettled window).
INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type, is_shared, created_at) VALUES
  ('11111111-8002-4000-8000-000000000032', '11111111-8002-4000-8000-000000000001',
   '11111111-8002-4000-8000-000000000011',
   '11111111-8002-4000-8000-000000000021',
   8000, current_date, 'expense', true, now() - interval '30 minutes');
-- Alice fronted the whole 8000 → alice +4000 on this transaction.
INSERT INTO public.transaction_splits (transaction_id, payer_id, payer_share_minor, partner_share_minor, split_method) VALUES
  ('11111111-8002-4000-8000-000000000032',
   '11111111-8002-4000-8000-000000000001',
   8000, 0, 'fixed');

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-8002-4000-8000-000000000001"}';

CREATE TEMP TABLE s7_second (settlement_id UUID) ON COMMIT DROP;
GRANT INSERT ON s7_second TO authenticated;
INSERT INTO s7_second SELECT public.rpc_mark_settled('11111111-8002-4000-8000-000000000010'::uuid);

SELECT isnt(
  (SELECT settlement_id FROM s7_second),
  (SELECT settlement_id FROM s7_first),
  'S7: re-settling the same period writes a NEW watermark (distinct from the first)'
);

SELECT is(
  public.rpc_settle_up('11111111-8002-4000-8000-000000000010'::uuid),
  0::bigint,
  'S7: tally resets to 0 after the deliberate same-period re-settle'
);

-- ─── S8 (migration 0079): settling notifies the PARTNER ──────────────────────
-- When alice settles, bob (the partner — not the settler) receives a
-- 'partner_settled_up' notification carrying the settler's display name.

SET LOCAL role TO postgres;
-- Fresh state: clear notifications + settlements; revive a non-zero balance.
DELETE FROM public.notifications
 WHERE user_id IN ('11111111-8002-4000-8000-000000000001','11111111-8002-4000-8000-000000000002');
DELETE FROM public.settlements WHERE family_unit_id = '11111111-8002-4000-8000-000000000010';
DELETE FROM public.transaction_splits WHERE transaction_id IN (
  '11111111-8002-4000-8000-000000000030','11111111-8002-4000-8000-000000000032');
UPDATE public.transactions SET archived_at = NULL  WHERE id = '11111111-8002-4000-8000-000000000030';
UPDATE public.transactions SET archived_at = now() WHERE id = '11111111-8002-4000-8000-000000000032';
-- Give alice a display name so the notification title is asserted exactly.
UPDATE public.profiles SET display_name = 'Alice'
 WHERE user_id = '11111111-8002-4000-8000-000000000001';
-- Alice fronted the whole 10000 → alice +5000 → non-zero, settleable.
INSERT INTO public.transaction_splits (transaction_id, payer_id, payer_share_minor, partner_share_minor, split_method) VALUES
  ('11111111-8002-4000-8000-000000000030','11111111-8002-4000-8000-000000000001',10000, 0, 'fixed');

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-8002-4000-8000-000000000001"}';
SELECT public.rpc_mark_settled('11111111-8002-4000-8000-000000000010'::uuid);

SET LOCAL role TO postgres;
SELECT is(
  (SELECT count(*)::int FROM public.notifications
    WHERE user_id = '11111111-8002-4000-8000-000000000002'
      AND type = 'partner_settled_up'),
  1,
  'S8: the partner (bob) receives exactly one partner_settled_up notification'
);

SELECT is(
  (SELECT count(*)::int FROM public.notifications
    WHERE user_id = '11111111-8002-4000-8000-000000000001'
      AND type = 'partner_settled_up'),
  0,
  'S8: the settler (alice) does NOT receive a settle notification'
);

SELECT is(
  (SELECT title FROM public.notifications
    WHERE user_id = '11111111-8002-4000-8000-000000000002'
      AND type = 'partner_settled_up' LIMIT 1),
  'Alice settled up',
  'S8: notification title carries the settler''s display name'
);

SELECT * FROM finish();
ROLLBACK;
