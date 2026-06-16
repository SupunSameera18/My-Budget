-- Story 7.1b: RLS visibility predicate golden suite
-- Updated in 0036: Personal transactions are always owner-only (no toggle).
-- Updated in 0046 (E9 retro finding): migration 0034 removed the join-date
-- restriction on Shared transactions ("Shared row: always visible to family
-- members — no join-date restriction", see auth_can_view_transaction). S4/S5/
-- S12b/S12c originally asserted the PRE-0034 invariant (pre-join Shared rows
-- invisible) and had silently gone stale — they now assert the current,
-- documented behavior instead. The join_date column still gates whether a
-- Shared transaction triggers a *notification* (Story 9.5/9.7), but it no
-- longer gates RLS *visibility* — those are two different invariants.
-- UUID block: eeeeeeee-* (reserved for 7.1b per dev-learnings §5)
--   eeeeeeee-eeee-4eee-8eee-000000000001 = alice (solo + family creator)
--   eeeeeeee-eeee-4eee-8eee-000000000002 = bob   (joins alice's family, later join_date)
--   eeeeeeee-eeee-4eee-8eee-000000000003 = carol  (stranger, no family relation)
--   eeeeeeee-eeee-4eee-8eee-000000000010 = alice's family_unit
--
-- Visibility scenarios exercised (29 assertions):
--   S1: owner reads own Personal row (no family)
--   S2: owner reads own Shared row (no family)
--   S3: stranger reads another user's Personal row
--   S4: pre-join Shared — visible to a later-joining family member (direct; no date gate since 0034)
--   S5: pre-join Shared — aggregate COUNT for later joiner (visible; no date gate since 0034)
--   S6: post-join Shared — row created on/after viewer's join_date (visible to both)
--   S7: Personal — owner sees own; partner CANNOT see (always blocked)
--   S8: partner cannot see other member's Personal (symmetric)
--  S10: owner always sees own Personal
--  S11: write path — non-member cannot INSERT is_shared=true transaction for another user
--  S12: scope-filter aggregate compatibility (GROUP BY is_shared — retro A10)

BEGIN;

SELECT plan(29);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED (as postgres — bypasses RLS)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE postgres;

-- Users (handle_new_user trigger auto-creates profiles)
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('eeeeeeee-eeee-4eee-8eee-000000000001', 'alice@test.com',  '{}'),
  ('eeeeeeee-eeee-4eee-8eee-000000000002', 'bob@test.com',    '{}'),
  ('eeeeeeee-eeee-4eee-8eee-000000000003', 'carol@test.com',  '{}');

-- Default categories for each user (needed for transactions.category_id NOT NULL)
SELECT public.seed_default_categories('eeeeeeee-eeee-4eee-8eee-000000000001');
SELECT public.seed_default_categories('eeeeeeee-eeee-4eee-8eee-000000000002');
SELECT public.seed_default_categories('eeeeeeee-eeee-4eee-8eee-000000000003');

-- Accounts for alice, bob, carol
INSERT INTO public.accounts (id, user_id, name, type, currency, actual_balance_minor)
VALUES
  ('eeeeeeee-eeee-4eee-8eee-000000000011', 'eeeeeeee-eeee-4eee-8eee-000000000001', 'Alice Cash', 'cash', 'USD', 0),
  ('eeeeeeee-eeee-4eee-8eee-000000000012', 'eeeeeeee-eeee-4eee-8eee-000000000002', 'Bob Cash',   'cash', 'USD', 0),
  ('eeeeeeee-eeee-4eee-8eee-000000000013', 'eeeeeeee-eeee-4eee-8eee-000000000003', 'Carol Cash', 'cash', 'USD', 0);

-- Family: alice joined 2026-01-01; bob joined 2026-02-01 (later joiner)
INSERT INTO public.family_units (id)
VALUES ('eeeeeeee-eeee-4eee-8eee-000000000010');

INSERT INTO public.family_members (family_unit_id, user_id, join_date, joined_at)
VALUES
  ('eeeeeeee-eeee-4eee-8eee-000000000010', 'eeeeeeee-eeee-4eee-8eee-000000000001', '2026-01-01', '2026-01-01 10:00:00'),
  ('eeeeeeee-eeee-4eee-8eee-000000000010', 'eeeeeeee-eeee-4eee-8eee-000000000002', '2026-02-01', '2026-02-01 10:00:00');

-- Transactions
-- Tx 1: alice Personal (pre-family, always visible to alice)
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  'eeeeeeee-eeee-4eee-8eee-000000000021',
  'eeeeeeee-eeee-4eee-8eee-000000000001',
  'eeeeeeee-eeee-4eee-8eee-000000000011',
  (SELECT id FROM public.categories WHERE user_id = 'eeeeeeee-eeee-4eee-8eee-000000000001' AND type = 'expense' LIMIT 1),
  1000, '2026-01-10', 'expense', false;

-- Tx 2: alice Shared PRE-JOIN (date < bob's join_date 2026-02-01) — invisible to bob
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  'eeeeeeee-eeee-4eee-8eee-000000000022',
  'eeeeeeee-eeee-4eee-8eee-000000000001',
  'eeeeeeee-eeee-4eee-8eee-000000000011',
  (SELECT id FROM public.categories WHERE user_id = 'eeeeeeee-eeee-4eee-8eee-000000000001' AND type = 'expense' LIMIT 1),
  2000, '2026-01-15', 'expense', true;

-- Tx 3: alice Shared POST-JOIN (date >= bob's join_date 2026-02-01) — visible to both
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  'eeeeeeee-eeee-4eee-8eee-000000000023',
  'eeeeeeee-eeee-4eee-8eee-000000000001',
  'eeeeeeee-eeee-4eee-8eee-000000000011',
  (SELECT id FROM public.categories WHERE user_id = 'eeeeeeee-eeee-4eee-8eee-000000000001' AND type = 'expense' LIMIT 1),
  3000, '2026-02-05', 'expense', true;

-- Tx 4: carol Personal (stranger, no family relation)
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  'eeeeeeee-eeee-4eee-8eee-000000000024',
  'eeeeeeee-eeee-4eee-8eee-000000000003',
  'eeeeeeee-eeee-4eee-8eee-000000000013',
  (SELECT id FROM public.categories WHERE user_id = 'eeeeeeee-eeee-4eee-8eee-000000000003' AND type = 'expense' LIMIT 1),
  4000, '2026-01-20', 'expense', false;

-- Tx 5: bob Personal (used in S8/S10/S12)
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  'eeeeeeee-eeee-4eee-8eee-000000000025',
  'eeeeeeee-eeee-4eee-8eee-000000000002',
  'eeeeeeee-eeee-4eee-8eee-000000000012',
  (SELECT id FROM public.categories WHERE user_id = 'eeeeeeee-eeee-4eee-8eee-000000000002' AND type = 'expense' LIMIT 1),
  5000, '2026-02-10', 'expense', false;

-- ═══════════════════════════════════════════════════════════════════════════
-- S1: owner reads own Personal row (no family context needed)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000001"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000021'),
  1,
  'S1: alice sees own Personal row'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S2: owner reads own Shared row (no family context needed — condition 1)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000022'),
  1,
  'S2: alice sees own Shared row regardless of is_shared flag'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S3: stranger reads another user's Personal row — must be blocked
-- ═══════════════════════════════════════════════════════════════════════════
-- Pre-assert: row exists as superuser
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000021'),
  1,
  'S3 pre-assert: alice Personal row exists'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000003"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000021'),
  0,
  'S3: carol (stranger) cannot see alice Personal row'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S4: pre-join Shared — visible to a later-joining family member (direct)
-- Migration 0034 removed the join-date restriction on Shared transactions:
-- "Shared row: always visible to family members — no join-date restriction."
-- ═══════════════════════════════════════════════════════════════════════════
-- Pre-assert: row exists as superuser
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000022'),
  1,
  'S4 pre-assert: alice pre-join Shared row exists'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000022'),
  1,
  'S4: bob CAN see alice pre-join Shared row (no join-date gate on Shared visibility since 0034; direct lookup)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S5: pre-join Shared — visible via aggregate COUNT (no join-date gate since 0034)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE user_id = 'eeeeeeee-eeee-4eee-8eee-000000000001'
     AND is_shared = true
     AND date < '2026-02-01'),
  1,
  'S5: bob aggregate count of alice pre-join Shared rows = 1 (no join-date gate on Shared visibility)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S6: post-join Shared — visible to both members
-- ═══════════════════════════════════════════════════════════════════════════
-- bob can see alice's post-join Shared row
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000023'),
  1,
  'S6a: bob can see alice post-join Shared row'
);

-- alice can see her own post-join Shared row (owner rule)
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000001"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000023'),
  1,
  'S6b: alice can see own post-join Shared row'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S7: Personal — owner sees own; partner CANNOT see (always blocked)
-- ═══════════════════════════════════════════════════════════════════════════
-- alice sees own Personal
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000021'),
  1,
  'S7a: alice sees own Personal row'
);

-- Pre-assert: alice Personal row exists for bob test
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000021'),
  1,
  'S7 pre-assert: alice Personal row exists for bob test'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000002"}';

-- Personal is always owner-only — bob is blocked regardless of any setting
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000021'),
  0,
  'S7b: bob cannot see alice Personal row (personal is always owner-only)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S8: Symmetric — alice cannot see bob Personal (always blocked)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000025'),
  1,
  'S8 pre-assert: bob Personal row exists'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000001"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000025'),
  0,
  'S8: alice cannot see bob Personal row (symmetric — personal is always owner-only)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S10: owner ALWAYS sees own Personal (condition 1 wins)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000021'),
  1,
  'S10a: alice sees own Personal (condition 1 — owner always visible)'
);

SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000025'),
  1,
  'S10b: bob sees own Personal (condition 1 — owner always visible)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S11: write path — non-member cannot INSERT is_shared=true transaction for another user
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000003"}';

-- carol tries to INSERT a Shared transaction with alice's user_id
SELECT throws_ok(
  $$INSERT INTO public.transactions
      (user_id, account_id, category_id, amount_minor, date, type, is_shared)
    SELECT
      'eeeeeeee-eeee-4eee-8eee-000000000001',
      'eeeeeeee-eeee-4eee-8eee-000000000011',
      (SELECT id FROM public.categories WHERE user_id = 'eeeeeeee-eeee-4eee-8eee-000000000001' AND type = 'expense' LIMIT 1),
      999, '2026-01-25', 'expense', true$$,
  '42501',
  NULL::text,
  'S11: carol cannot INSERT is_shared=true transaction owned by alice (42501)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S12: Scope-filter aggregate compatibility (Retro A10)
-- GROUP BY is_shared — confirms predicate is compatible with the E6 scope seam
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000002"}';

-- bob's own Personal row (tx 5: eeee..0025) → is_shared=false bucket
-- alice's post-join Shared (tx 3: eeee..0023) → is_shared=true bucket
-- alice's pre-join Shared (tx 2: eeee..0022) → is_shared=true bucket too (no join-date gate since 0034)
-- alice's Personal (tx 1: eeee..0021) → BLOCKED (personal is always owner-only)

-- Personal bucket (is_shared=false): only bob's own Personal (alice's is blocked)
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions WHERE is_shared = false),
  1,
  'S12a: Personal bucket contains only bob own Personal (alice Personal always blocked)'
);

-- Shared bucket (is_shared=true): alice's pre-join AND post-join Shared rows (no join-date gate since 0034)
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions WHERE is_shared = true),
  2,
  'S12b: Shared bucket contains both alice Shared rows (pre-join + post-join; no join-date gate on Shared)'
);

-- Pre-assert: the pre-join Shared row physically exists (non-vacuous)
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000022'),
  1,
  'S12 pre-assert: alice pre-join Shared row exists physically'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000002"}';

-- Pre-join row DOES appear in Shared bucket for bob (no join-date gate since 0034)
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000022'),
  1,
  'S12c: alice pre-join Shared row appears in bob scope-filter query (no join-date gate on Shared visibility)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Additional no-directional-leak assertion: confirm no state produces
-- one-directional visibility (alice sees what bob sees on Shared rows)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000001"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000023'),
  1,
  'S12d: alice also sees own post-join Shared row (symmetric Shared visibility)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- goals: is_shared column added + goal visibility policy
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE postgres;

-- Confirm is_shared column exists on goals
SELECT has_column(
  'public', 'goals', 'is_shared',
  'goals.is_shared column exists'
);

SELECT col_not_null(
  'public', 'goals', 'is_shared',
  'goals.is_shared is NOT NULL'
);

-- alice's personal goal visible to alice
INSERT INTO public.goals (id, user_id, name, target_minor)
VALUES (
  'eeeeeeee-eeee-4eee-8eee-000000000030',
  'eeeeeeee-eeee-4eee-8eee-000000000001',
  'Alice Goal', 10000
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000001"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.goals WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000030'),
  1,
  'goals: alice sees own personal goal'
);

-- bob cannot see alice's personal goal
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.goals WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000030'),
  0,
  'goals: bob cannot see alice personal goal'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- activity_trail: partner sees trail for Shared transactions they can view
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE postgres;

-- Create a trail entry on alice's post-join Shared tx (tx 3: eeee..0023)
INSERT INTO public.activity_trail (id, user_id, transaction_id, change_type, changed_fields)
VALUES (
  'eeeeeeee-eeee-4eee-8eee-000000000040',
  'eeeeeeee-eeee-4eee-8eee-000000000001',
  'eeeeeeee-eeee-4eee-8eee-000000000023',
  'edit', '{"note":{"old":null,"new":"dinner"}}'::jsonb
);

-- Create a trail entry on alice's Personal tx (tx 1: eeee..0021)
INSERT INTO public.activity_trail (id, user_id, transaction_id, change_type, changed_fields)
VALUES (
  'eeeeeeee-eeee-4eee-8eee-000000000041',
  'eeeeeeee-eeee-4eee-8eee-000000000001',
  'eeeeeeee-eeee-4eee-8eee-000000000021',
  'edit', '{"note":{"old":null,"new":"personal note"}}'::jsonb
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000002"}';

-- bob can see the trail entry for the post-join Shared tx
SELECT is(
  (SELECT COUNT(*)::int FROM public.activity_trail
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000040'),
  1,
  'activity_trail: bob sees trail entry for post-join Shared tx'
);

-- bob cannot see the trail entry for alice's Personal tx (personal is always owner-only)
-- Pre-assert: entry exists as superuser
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.activity_trail
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000041'),
  1,
  'activity_trail pre-assert: alice Personal tx trail entry exists'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000002"}';

-- Personal transactions are always owner-only; trail entries for Personal tx are also blocked
SELECT is(
  (SELECT COUNT(*)::int FROM public.activity_trail
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000041'),
  0,
  'activity_trail: bob cannot see alice Personal tx trail entry (personal always owner-only)'
);

SELECT * FROM finish();

ROLLBACK;
