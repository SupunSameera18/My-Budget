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
--   11111111-7008-4000-8000-000000000031 = tx_n1 (Story 9.7: shared, push NOT yet delivered)
--   11111111-7008-4000-8000-000000000032 = tx_n2 (Story 9.7: shared, push already delivered)
--   11111111-7008-4000-8000-000000000033 = tx_n3 (Story 9.7: personal, reclassified to shared)
--   11111111-7008-4000-8000-000000000034 = tx_n4 (Story 9.7 review: alice's shared, UNRELATED — must survive tx_n1's cleanup)
--   11111111-7008-4000-8000-000000000004 = carol (no family — used for T-new-5, no-partner cleanup branch)
--   11111111-7008-4000-8000-000000000014 = carol account
--   11111111-7008-4000-8000-000000000035 = tx_no_partner (carol's shared, used for T-new-5)
--
-- Scenarios (AC: 7, 14):
--   P0: pre-asserts — fixture state proven non-vacuous
--   S1: pre-join block — tx_pre_join cannot become Shared (P0003)
--   S2: Personal→Shared allowed — tx_personal flips, split auto-created, trail written
--   S3: Shared→Personal — tx_shared flips, split hard-deleted, trail written
--   S4: AC14 — bob sees 0 rows for tx_shared after S3 reclassification
--   S5: non-owner — bob cannot reclassify alice's tx_personal (42501)
--   S6: already same type — alice tries Personal→Personal on tx_pre_join (P0001)
--
-- Story 9.7 — privacy-aware notification cleanup on Shared→Personal:
--   T-new-1: partner notification DELETED when push_notified_at IS NULL
--   T-new-2: partner notification dismissed when push already delivered
--   T-new-3: Personal→Shared reclassification does not insert a partner notification
--   T-new-4: Personal→Shared with no pre-existing partner notification — no errors, no side effects
--   T-new-5 (review): Shared→Personal cleanup with NO partner at all — no error, nothing to clean up
--   T-new-6 (review): Shared→Personal cleanup leaves an UNRELATED notification untouched

BEGIN;

SELECT plan(25);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED (as postgres — bypasses RLS)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-7008-4000-8000-000000000001', 'alice-7008@test.com', '{}'),
  ('11111111-7008-4000-8000-000000000002', 'bob-7008@test.com',   '{}'),
  ('11111111-7008-4000-8000-000000000004', 'carol-7008@test.com', '{}');

SELECT public.seed_default_categories('11111111-7008-4000-8000-000000000001');
SELECT public.seed_default_categories('11111111-7008-4000-8000-000000000002');
SELECT public.seed_default_categories('11111111-7008-4000-8000-000000000004');

INSERT INTO public.accounts (id, user_id, name, type, currency, actual_balance_minor)
VALUES
  ('11111111-7008-4000-8000-000000000011', '11111111-7008-4000-8000-000000000001', 'Alice 7008 Cash', 'cash', 'USD', 0),
  ('11111111-7008-4000-8000-000000000012', '11111111-7008-4000-8000-000000000002', 'Bob 7008 Cash',   'cash', 'USD', 0),
  ('11111111-7008-4000-8000-000000000014', '11111111-7008-4000-8000-000000000004', 'Carol 7008 Cash', 'cash', 'USD', 0);

-- carol is NOT a family member (standalone user — no partner) — used for T-new-5

INSERT INTO public.family_units (id)
VALUES ('11111111-7008-4000-8000-000000000010');

-- Alice joined first (2026-01-01); Bob joined later (2026-03-01).
-- Bob cannot see alice's personal transactions (personal is always owner-only, AC14 / S4).
INSERT INTO public.family_members (family_unit_id, user_id, join_date, joined_at)
VALUES
  ('11111111-7008-4000-8000-000000000010', '11111111-7008-4000-8000-000000000001', '2026-01-01', '2026-01-01 10:00:00'),
  ('11111111-7008-4000-8000-000000000010', '11111111-7008-4000-8000-000000000002', '2026-03-01', '2026-03-01 10:00:00');

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

-- tx_n1: alice's shared, date AFTER bob's join date — used for T-new-1 (push not yet delivered)
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-7008-4000-8000-000000000031',
  '11111111-7008-4000-8000-000000000001',
  '11111111-7008-4000-8000-000000000011',
  (SELECT id FROM public.categories WHERE user_id = '11111111-7008-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  500, '2026-04-03', 'expense', true;

-- tx_n2: alice's shared, date AFTER bob's join date — used for T-new-2 (push already delivered)
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-7008-4000-8000-000000000032',
  '11111111-7008-4000-8000-000000000001',
  '11111111-7008-4000-8000-000000000011',
  (SELECT id FROM public.categories WHERE user_id = '11111111-7008-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  600, '2026-04-04', 'expense', true;

-- tx_n3: alice's personal, date AFTER bob's join date — used for T-new-3/T-new-4 (Personal→Shared)
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-7008-4000-8000-000000000033',
  '11111111-7008-4000-8000-000000000001',
  '11111111-7008-4000-8000-000000000011',
  (SELECT id FROM public.categories WHERE user_id = '11111111-7008-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  700, '2026-04-05', 'expense', false;

-- tx_n4: alice's shared, date AFTER bob's join date — UNRELATED transaction used
-- only for T-new-6 (proves tx_n1's cleanup doesn't touch other notifications)
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-7008-4000-8000-000000000034',
  '11111111-7008-4000-8000-000000000001',
  '11111111-7008-4000-8000-000000000011',
  (SELECT id FROM public.categories WHERE user_id = '11111111-7008-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  900, '2026-04-06', 'expense', true;

-- tx_no_partner: carol's shared (carol has no partner) — used for T-new-5
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-7008-4000-8000-000000000035',
  '11111111-7008-4000-8000-000000000004',
  '11111111-7008-4000-8000-000000000014',
  (SELECT id FROM public.categories WHERE user_id = '11111111-7008-4000-8000-000000000004' AND type = 'expense' LIMIT 1),
  300, '2026-04-07', 'expense', true;

-- Seed partner (bob) notifications referencing tx_n1 / tx_n2, as postgres
-- superuser (INSERT is revoked from authenticated — migration 0040).
INSERT INTO public.notifications (user_id, type, title, body, link, metadata, push_notified_at)
VALUES (
  '11111111-7008-4000-8000-000000000002', -- bob
  'partner_shared_transaction',
  'Partner added a shared transaction',
  'A new shared transaction was logged.',
  '/transactions/11111111-7008-4000-8000-000000000031',
  jsonb_build_object('transaction_id', '11111111-7008-4000-8000-000000000031'),
  NULL -- T-new-1: push not yet delivered
);

INSERT INTO public.notifications (user_id, type, title, body, link, metadata, push_notified_at)
VALUES (
  '11111111-7008-4000-8000-000000000002', -- bob
  'partner_shared_transaction',
  'Partner added a shared transaction',
  'A new shared transaction was logged.',
  '/transactions/11111111-7008-4000-8000-000000000032',
  jsonb_build_object('transaction_id', '11111111-7008-4000-8000-000000000032'),
  now() -- T-new-2: push already delivered
);

-- Unrelated notification for bob referencing tx_n4 — must survive tx_n1's
-- cleanup untouched (T-new-6 precision check on the metadata->>'transaction_id' filter)
INSERT INTO public.notifications (user_id, type, title, body, link, metadata, push_notified_at)
VALUES (
  '11111111-7008-4000-8000-000000000002', -- bob
  'partner_shared_transaction',
  'Partner added a shared transaction',
  'A new shared transaction was logged.',
  '/transactions/11111111-7008-4000-8000-000000000034',
  jsonb_build_object('transaction_id', '11111111-7008-4000-8000-000000000034'),
  NULL -- not yet delivered — same Case A bucket as tx_n1, but a different transaction_id
);

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
--     Personal transactions are always owner-only; the is_shared flip correctly
--     withdraws the row from the partner's visible set.
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

-- ═══════════════════════════════════════════════════════════════════════════
-- Story 9.7 — T-new-1: Shared→Personal, push NOT yet delivered
--     Expect: bob's notification row for tx_n1 is hard-DELETED
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7008-4000-8000-000000000001"}';

SELECT public.rpc_reclassify_transaction(
  '11111111-7008-4000-8000-000000000031'::uuid,
  false
);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT COUNT(*)::int FROM public.notifications
   WHERE user_id = '11111111-7008-4000-8000-000000000002'
     AND type = 'partner_shared_transaction'
     AND (metadata->>'transaction_id') = '11111111-7008-4000-8000-000000000031'),
  0,
  'T-new-1: bob''s notification for tx_n1 deleted (push_notified_at was NULL)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Story 9.7 — T-new-2: Shared→Personal, push ALREADY delivered
--     Expect: bob's notification row for tx_n2 is dismissed (not deleted)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7008-4000-8000-000000000001"}';

SELECT public.rpc_reclassify_transaction(
  '11111111-7008-4000-8000-000000000032'::uuid,
  false
);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT dismissed_at IS NOT NULL FROM public.notifications
   WHERE user_id = '11111111-7008-4000-8000-000000000002'
     AND type = 'partner_shared_transaction'
     AND (metadata->>'transaction_id') = '11111111-7008-4000-8000-000000000032'),
  true,
  'T-new-2: bob''s notification for tx_n2 dismissed (push_notified_at was set)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Story 9.7 — T-new-3: Personal→Shared does not insert a partner notification
--     (rpc_reclassify_transaction itself never inserts notifications;
--      that is rpc_notify_partner_shared_transaction's job, called separately)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7008-4000-8000-000000000001"}';

SELECT public.rpc_reclassify_transaction(
  '11111111-7008-4000-8000-000000000033'::uuid,
  true
);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT COUNT(*)::int FROM public.notifications
   WHERE user_id = '11111111-7008-4000-8000-000000000002'
     AND (metadata->>'transaction_id') = '11111111-7008-4000-8000-000000000033'),
  0,
  'T-new-3: Personal→Shared reclassification inserts 0 partner notifications'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Story 9.7 — T-new-4: Personal→Shared with no pre-existing partner notification
--     Expect: no errors, tx_n3 flips to shared (side-effect-free on notifications)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT is(
  (SELECT is_shared FROM public.transactions WHERE id = '11111111-7008-4000-8000-000000000033'),
  true,
  'T-new-4: tx_n3 flipped to shared with no errors (no pre-existing partner notification)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Review T-new-5: Shared→Personal cleanup with NO partner at all
--     carol has no family/partner — the v_partner_id lookup in the cleanup
--     block resolves to NULL, so the cleanup is a no-op (IF v_partner_id IS
--     NOT NULL guard skips it). Expect: no error, tx flips to personal.
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-7008-4000-8000-000000000004"}';

SELECT lives_ok(
  $$ SELECT public.rpc_reclassify_transaction(
       '11111111-7008-4000-8000-000000000035'::uuid,
       false
     ) $$,
  'T-new-5: Shared→Personal with no partner at all raises no error'
);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT is_shared FROM public.transactions WHERE id = '11111111-7008-4000-8000-000000000035'),
  false,
  'T-new-5: tx_no_partner flipped to personal despite carol having no partner to clean up notifications for'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Review T-new-6: Shared→Personal cleanup leaves an UNRELATED notification
--     untouched (precision check on the metadata->>'transaction_id' filter).
--     tx_n1's cleanup already ran earlier (T-new-1); tx_n4's notification
--     was seeded in the same Case A bucket (push_notified_at IS NULL) but
--     references a DIFFERENT transaction_id and must still be present.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT is(
  (SELECT COUNT(*)::int FROM public.notifications
   WHERE user_id = '11111111-7008-4000-8000-000000000002'
     AND type = 'partner_shared_transaction'
     AND (metadata->>'transaction_id') = '11111111-7008-4000-8000-000000000034'),
  1,
  'T-new-6: bob''s unrelated notification for tx_n4 survives tx_n1''s cleanup untouched'
);

SELECT * FROM finish();

ROLLBACK;
