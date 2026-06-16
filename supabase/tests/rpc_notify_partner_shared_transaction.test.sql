-- Story 9.5: rpc_notify_partner_shared_transaction pgTAP tests
-- UUID block: 11111111-9005-* (story number embedded; iiiiiiii-* is invalid hex — dev-learnings §22)
--   11111111-9005-4000-8000-000000000001 = alice (caller / transaction owner)
--   11111111-9005-4000-8000-000000000002 = bob   (partner / notification recipient)
--   11111111-9005-4000-8000-000000000003 = dave  (standalone user — no family)
--   11111111-9005-4000-8000-000000000010 = family_unit
--   11111111-9005-4000-8000-000000000030 = alice account
--   11111111-9005-4000-8000-000000000031 = dave account
--   11111111-9005-4000-8000-000000000020 = shared transaction (post-join date, amount_minor=5000)
--   11111111-9005-4000-8000-000000000021 = shared transaction dated before bob's join_date
--   11111111-9005-4000-8000-000000000022 = personal transaction (is_shared=false)
--   11111111-9005-4000-8000-000000000023 = dave's standalone transaction (no family)
--   11111111-9005-4000-8000-000000000024 = shared transaction used only for T12 (dismiss-then-reshare)
--
-- Scenarios:
--   T1: happy path — notification created for partner
--   T2: idempotency — second call does not duplicate
--   T3: join-date invariant — transaction before partner's join date → no notification
--   T4: personal transaction → no notification
--   T5: notification link is correct
--   T6: metadata transaction_id is correct
--   T7: metadata amount_minor is correct
--   T8: caller (alice) is never notified — notification goes to partner only
--   T9: non-family user (dave) → no notification, no error
--   T10: non-existent transaction id → returns silently, no error, no notifications
--   T11: auth guard — non-owner caller (dave) passing alice's transaction_id is blocked, no duplicate notification
--   T12: code-review follow-up (0047) — a dismissed notification no longer blocks
--        a fresh re-notify for the same transaction_id (dismiss-then-reshare cycle)

BEGIN;

SELECT plan(12);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED (as postgres — bypasses RLS)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-9005-4000-8000-000000000001', 'alice-9005@test.com', '{}'),
  ('11111111-9005-4000-8000-000000000002', 'bob-9005@test.com',   '{}'),
  ('11111111-9005-4000-8000-000000000003', 'dave-9005@test.com',  '{}');

SELECT public.seed_default_categories('11111111-9005-4000-8000-000000000001');
SELECT public.seed_default_categories('11111111-9005-4000-8000-000000000002');
SELECT public.seed_default_categories('11111111-9005-4000-8000-000000000003');

INSERT INTO public.accounts (id, user_id, name, type, currency, actual_balance_minor)
VALUES
  ('11111111-9005-4000-8000-000000000030', '11111111-9005-4000-8000-000000000001', 'Alice 9005 Bank', 'bank', 'USD', 0),
  ('11111111-9005-4000-8000-000000000031', '11111111-9005-4000-8000-000000000003', 'Dave 9005 Cash',  'cash', 'USD', 0);

INSERT INTO public.family_units (id)
VALUES ('11111111-9005-4000-8000-000000000010');

INSERT INTO public.family_members (family_unit_id, user_id, join_date)
VALUES
  ('11111111-9005-4000-8000-000000000010', '11111111-9005-4000-8000-000000000001', '2026-01-01'),
  ('11111111-9005-4000-8000-000000000010', '11111111-9005-4000-8000-000000000002', '2026-01-01');

-- dave is NOT a family member (standalone user)

-- Shared transaction owned by alice, dated on/after bob's join date
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-9005-4000-8000-000000000020',
  '11111111-9005-4000-8000-000000000001',
  '11111111-9005-4000-8000-000000000030',
  (SELECT id FROM public.categories WHERE user_id = '11111111-9005-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  5000, CURRENT_DATE, 'expense', true;

-- Shared transaction owned by alice, dated BEFORE bob's join date
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-9005-4000-8000-000000000021',
  '11111111-9005-4000-8000-000000000001',
  '11111111-9005-4000-8000-000000000030',
  (SELECT id FROM public.categories WHERE user_id = '11111111-9005-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  2000, '2025-12-31', 'expense', true;

-- Personal transaction owned by alice
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-9005-4000-8000-000000000022',
  '11111111-9005-4000-8000-000000000001',
  '11111111-9005-4000-8000-000000000030',
  (SELECT id FROM public.categories WHERE user_id = '11111111-9005-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  300, CURRENT_DATE, 'expense', false;

-- Dave's standalone shared transaction (dave has no family)
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-9005-4000-8000-000000000023',
  '11111111-9005-4000-8000-000000000003',
  '11111111-9005-4000-8000-000000000031',
  (SELECT id FROM public.categories WHERE user_id = '11111111-9005-4000-8000-000000000003' AND type = 'expense' LIMIT 1),
  100, CURRENT_DATE, 'expense', true;

-- Shared transaction used only for T12 (dismiss-then-reshare idempotency)
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-9005-4000-8000-000000000024',
  '11111111-9005-4000-8000-000000000001',
  '11111111-9005-4000-8000-000000000030',
  (SELECT id FROM public.categories WHERE user_id = '11111111-9005-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  750, CURRENT_DATE, 'expense', true;

-- ═══════════════════════════════════════════════════════════════════════════
-- T1: happy path — notification created for partner (bob)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-9005-4000-8000-000000000001"}';

SELECT public.rpc_notify_partner_shared_transaction('11111111-9005-4000-8000-000000000020'::uuid);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT COUNT(*)::int FROM public.notifications
   WHERE user_id = '11111111-9005-4000-8000-000000000002'
     AND type = 'partner_shared_transaction'),
  1,
  'T1: bob has 1 partner_shared_transaction notification'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- T2: idempotency — second call does not duplicate
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-9005-4000-8000-000000000001"}';

SELECT public.rpc_notify_partner_shared_transaction('11111111-9005-4000-8000-000000000020'::uuid);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT COUNT(*)::int FROM public.notifications
   WHERE user_id = '11111111-9005-4000-8000-000000000002'
     AND type = 'partner_shared_transaction'),
  1,
  'T2: idempotency — bob notification count stays at 1 after second call'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- T3: join-date invariant — transaction before bob's join date → no notification
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-9005-4000-8000-000000000001"}';

SELECT public.rpc_notify_partner_shared_transaction('11111111-9005-4000-8000-000000000021'::uuid);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT COUNT(*)::int FROM public.notifications
   WHERE user_id = '11111111-9005-4000-8000-000000000002'
     AND (metadata->>'transaction_id') = '11111111-9005-4000-8000-000000000021'),
  0,
  'T3: pre-join-date transaction does not notify bob'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- T4: personal transaction → no notification
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-9005-4000-8000-000000000001"}';

SELECT public.rpc_notify_partner_shared_transaction('11111111-9005-4000-8000-000000000022'::uuid);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT COUNT(*)::int FROM public.notifications
   WHERE user_id = '11111111-9005-4000-8000-000000000002'
     AND (metadata->>'transaction_id') = '11111111-9005-4000-8000-000000000022'),
  0,
  'T4: personal transaction does not notify bob'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- T5: notification link is correct
-- ═══════════════════════════════════════════════════════════════════════════
SELECT is(
  (SELECT link FROM public.notifications
   WHERE user_id = '11111111-9005-4000-8000-000000000002'
     AND (metadata->>'transaction_id') = '11111111-9005-4000-8000-000000000020'),
  '/transactions/11111111-9005-4000-8000-000000000020',
  'T5: notification link points to the transaction'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- T6: metadata transaction_id is correct
-- ═══════════════════════════════════════════════════════════════════════════
SELECT is(
  (SELECT metadata->>'transaction_id' FROM public.notifications
   WHERE user_id = '11111111-9005-4000-8000-000000000002'
     AND type = 'partner_shared_transaction'
     AND (metadata->>'transaction_id') = '11111111-9005-4000-8000-000000000020'),
  '11111111-9005-4000-8000-000000000020',
  'T6: metadata.transaction_id matches the transaction'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- T7: metadata amount_minor is correct
-- ═══════════════════════════════════════════════════════════════════════════
SELECT is(
  (SELECT metadata->>'amount_minor' FROM public.notifications
   WHERE user_id = '11111111-9005-4000-8000-000000000002'
     AND (metadata->>'transaction_id') = '11111111-9005-4000-8000-000000000020'),
  '5000',
  'T7: metadata.amount_minor matches the transaction amount'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- T8: caller (alice) is never notified — notification goes to partner only
-- ═══════════════════════════════════════════════════════════════════════════
SELECT is(
  (SELECT COUNT(*)::int FROM public.notifications
   WHERE user_id = '11111111-9005-4000-8000-000000000001'
     AND type = 'partner_shared_transaction'),
  0,
  'T8: alice (caller/owner) has 0 partner_shared_transaction notifications'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- T9: non-family user (dave) → no notification, no error
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-9005-4000-8000-000000000003"}';

SELECT public.rpc_notify_partner_shared_transaction('11111111-9005-4000-8000-000000000023'::uuid);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT COUNT(*)::int FROM public.notifications WHERE type = 'partner_shared_transaction'
   AND (metadata->>'transaction_id') = '11111111-9005-4000-8000-000000000023'),
  0,
  'T9: non-family caller (dave) produces no notification'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- T10: non-existent transaction id → returns silently, no error
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-9005-4000-8000-000000000001"}';

SELECT lives_ok(
  $$ SELECT public.rpc_notify_partner_shared_transaction('11111111-9005-4000-8000-000000000099'::uuid) $$,
  'T10: non-existent transaction id returns silently without error'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- T11: auth guard — non-owner caller (dave) passing alice's transaction_id is blocked
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-9005-4000-8000-000000000003"}';

SELECT public.rpc_notify_partner_shared_transaction('11111111-9005-4000-8000-000000000020'::uuid);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT COUNT(*)::int FROM public.notifications
   WHERE user_id = '11111111-9005-4000-8000-000000000002'
     AND type = 'partner_shared_transaction'),
  1,
  'T11: non-owner (dave) calling with alice''s transaction_id is blocked by the auth guard — no duplicate notification'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- T12: code-review follow-up (0047) — dismiss-then-reshare cycle
--     1. alice shares tx_024 → bob gets a notification
--     2. bob's notification is dismissed (simulating 0046's Shared→Personal
--        Case B cleanup, without re-running the full reclassify flow)
--     3. alice "re-shares" by calling notify again for the same tx_024
--     Expect: a fresh, non-dismissed notification now exists for bob —
--     the old dismissed row no longer blocks the idempotency check.
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-9005-4000-8000-000000000001"}';

SELECT public.rpc_notify_partner_shared_transaction('11111111-9005-4000-8000-000000000024'::uuid);

SET LOCAL ROLE postgres;

-- Simulate 0046's Case B cleanup (push already delivered → dismissed, not deleted)
UPDATE public.notifications
   SET dismissed_at = now(), read_at = COALESCE(read_at, now())
 WHERE user_id = '11111111-9005-4000-8000-000000000002'
   AND type = 'partner_shared_transaction'
   AND (metadata->>'transaction_id') = '11111111-9005-4000-8000-000000000024';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-9005-4000-8000-000000000001"}';

SELECT public.rpc_notify_partner_shared_transaction('11111111-9005-4000-8000-000000000024'::uuid);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT COUNT(*)::int FROM public.notifications
   WHERE user_id = '11111111-9005-4000-8000-000000000002'
     AND type = 'partner_shared_transaction'
     AND (metadata->>'transaction_id') = '11111111-9005-4000-8000-000000000024'
     AND dismissed_at IS NULL),
  1,
  'T12: dismissed notification no longer blocks a fresh re-notify for the same transaction_id'
);

SELECT * FROM finish();

ROLLBACK;
