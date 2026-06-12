-- Story 7.1b: RLS visibility predicate golden suite
-- UUID block: eeeeeeee-* (reserved for 7.1b per dev-learnings §5)
--   eeeeeeee-eeee-4eee-8eee-000000000001 = alice (solo + family creator)
--   eeeeeeee-eeee-4eee-8eee-000000000002 = bob   (joins alice's family, later join_date)
--   eeeeeeee-eeee-4eee-8eee-000000000003 = carol  (stranger, no family relation)
--   eeeeeeee-eeee-4eee-8eee-000000000010 = alice's family_unit
--
-- Visibility scenarios exercised (11 AC scenarios + 1 scope-filter aggregate = 35 assertions):
--   S1: owner reads own Personal row (no family)
--   S2: owner reads own Shared row (no family)
--   S3: stranger reads another user's Personal row
--   S4: pre-join Shared — row created before viewer's join_date (direct)
--   S5: pre-join Shared — aggregate COUNT for later joiner
--   S6: post-join Shared — row created on/after viewer's join_date (visible to both)
--   S7: Personal, no hide_personal — owner sees; partner sees (opt-out model)
--   S8: hide_personal member1=true — partner cannot see member1's Personal
--   S9: hide_personal member2=true — member2 cannot see member1's Personal (symmetric)
--  S10: hide_personal active — owner still sees own Personal
--  S11: write path — non-member cannot INSERT is_shared=true transaction for another user
--  S12: scope-filter aggregate compatibility (GROUP BY is_shared — retro A10)

BEGIN;

SELECT plan(35);

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
-- S4: pre-join Shared — invisible to later joiner (direct)
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
  0,
  'S4: bob cannot see alice pre-join Shared row (direct lookup)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S5: pre-join Shared — invisible via aggregate COUNT
-- ═══════════════════════════════════════════════════════════════════════════
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE user_id = 'eeeeeeee-eeee-4eee-8eee-000000000001'
     AND is_shared = true
     AND date < '2026-02-01'),
  0,
  'S5: bob aggregate count of alice pre-join Shared rows = 0'
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
-- S7: Personal, no hide_personal — owner sees; partner blocked
-- ═══════════════════════════════════════════════════════════════════════════
-- alice sees own Personal
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000021'),
  1,
  'S7a: alice sees own Personal (no hide_personal)'
);

-- bob tries to see alice's Personal — blocked when hide_personal=false for both
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000021'),
  1,
  'S7 pre-assert: alice Personal row exists for bob test'
);

-- Confirm hide_personal is false for both members (default state)
SELECT is(
  (SELECT BOOL_AND(NOT hide_personal) FROM public.family_members
   WHERE family_unit_id = 'eeeeeeee-eeee-4eee-8eee-000000000010'),
  true,
  'S7 pre-assert: hide_personal is false for all members'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000002"}';

-- With no hide_personal set, bob CAN see alice's Personal (partner visibility when no privacy toggle)
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000021'),
  1,
  'S7b: bob can see alice Personal row when hide_personal=false for both'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S8: hide_personal member1 (alice) = true → bob cannot see alice Personal
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE postgres;
UPDATE public.family_members
   SET hide_personal = true
 WHERE family_unit_id = 'eeeeeeee-eeee-4eee-8eee-000000000010'
   AND user_id        = 'eeeeeeee-eeee-4eee-8eee-000000000001';

-- Pre-assert: alice's Personal row still physically exists
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000021'),
  1,
  'S8 pre-assert: alice Personal row still physically exists'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000021'),
  0,
  'S8: bob cannot see alice Personal when alice.hide_personal=true'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S9: Symmetric — hide_personal member2 (bob) = true → alice cannot see bob Personal
--     (alice's toggle still true from S8; also testing OR symmetry)
-- ═══════════════════════════════════════════════════════════════════════════
-- Reset alice's flag; set bob's flag instead to test pure bob-side symmetry
SET LOCAL ROLE postgres;
UPDATE public.family_members
   SET hide_personal = false
 WHERE family_unit_id = 'eeeeeeee-eeee-4eee-8eee-000000000010'
   AND user_id        = 'eeeeeeee-eeee-4eee-8eee-000000000001';

UPDATE public.family_members
   SET hide_personal = true
 WHERE family_unit_id = 'eeeeeeee-eeee-4eee-8eee-000000000010'
   AND user_id        = 'eeeeeeee-eeee-4eee-8eee-000000000002';

-- Insert a bob Personal transaction so we have something to test
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  'eeeeeeee-eeee-4eee-8eee-000000000025',
  'eeeeeeee-eeee-4eee-8eee-000000000002',
  'eeeeeeee-eeee-4eee-8eee-000000000012',
  (SELECT id FROM public.categories WHERE user_id = 'eeeeeeee-eeee-4eee-8eee-000000000002' AND type = 'expense' LIMIT 1),
  5000, '2026-02-10', 'expense', false;

-- Pre-assert: bob's Personal row exists
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000025'),
  1,
  'S9 pre-assert: bob Personal row exists'
);

-- Also pre-assert alice's Personal row still exists (for S10 later)
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000021'),
  1,
  'S9/S10 pre-assert: alice Personal row exists'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000001"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000025'),
  0,
  'S9a: alice cannot see bob Personal when bob.hide_personal=true (symmetric)'
);

-- S9b also tests that alice cannot see her OWN partner's Personal when bob's flag is set,
-- but this is the same as S9a. Additionally confirm bob still can't see alice's Personal
-- (because the OR: bob.hide_personal=true → alice's Personal also hidden from bob)
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000021'),
  0,
  'S9b: bob cannot see alice Personal when bob.hide_personal=true (OR symmetry)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S10: hide_personal active — owner ALWAYS sees own Personal (condition 1 wins)
-- ═══════════════════════════════════════════════════════════════════════════
-- bob.hide_personal is still true from S9.
-- alice reads her own Personal — must still be visible (owner rule overrides everything)
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000001"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000021'),
  1,
  'S10: alice still sees own Personal even when hide_personal active (condition 1)'
);

-- bob reads own Personal (condition 1)
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000025'),
  1,
  'S10b: bob still sees own Personal even when own hide_personal=true (condition 1)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- S11: write path — non-member cannot INSERT is_shared=true transaction for another user
-- ═══════════════════════════════════════════════════════════════════════════
-- Reset hide_personal for clean state
SET LOCAL ROLE postgres;
UPDATE public.family_members SET hide_personal = false
 WHERE family_unit_id = 'eeeeeeee-eeee-4eee-8eee-000000000010';

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

-- Pre-assert: confirm hide_personal=false for both members before S12 aggregate
-- assertions (S12a count depends on Personal cross-visibility being active).
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT COUNT(*)::int FROM public.family_members
   WHERE family_unit_id = 'eeeeeeee-eeee-4eee-8eee-000000000010'
     AND hide_personal = false),
  2,
  'S12 pre-assert: both members have hide_personal=false (Personal cross-visibility active)'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000002"}';

-- bob's own Personal row (tx 5: eeee..0025) → is_shared=false bucket
-- alice's post-join Shared (tx 3: eeee..0023) → is_shared=true bucket
-- alice's pre-join Shared (tx 2: eeee..0022) → must NOT appear in any bucket
-- alice's Personal (tx 1: eeee..0021) → visible to bob (hide_personal=false); is_shared=false bucket

-- Personal bucket (is_shared=false): bob's own Personal + alice's Personal (no privacy toggle)
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions WHERE is_shared = false),
  2,
  'S12a: Personal bucket contains bob own + alice Personal (no privacy toggle active)'
);

-- Shared bucket (is_shared=true): only alice's post-join Shared
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions WHERE is_shared = true),
  1,
  'S12b: Shared bucket contains only alice post-join Shared row (pre-join excluded)'
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

-- Pre-join row must NOT appear in Shared bucket for bob
SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000022'),
  0,
  'S12c: alice pre-join Shared row does not leak into bob scope-filter query'
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

-- bob cannot see the trail entry for alice's Personal tx
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

-- Note: with hide_personal=false (reset above), bob CAN see alice's Personal.
-- Therefore bob also sees alice's Personal trail entry.
-- Verify the Personal trail IS visible to bob (no privacy toggle active)
SELECT is(
  (SELECT COUNT(*)::int FROM public.activity_trail
   WHERE id = 'eeeeeeee-eeee-4eee-8eee-000000000041'),
  1,
  'activity_trail: bob sees alice Personal trail entry when hide_personal=false'
);

SELECT * FROM finish();

ROLLBACK;
