-- pgTAP tests for rpc_edit_shared_transaction + rpc_get_transaction_owner_categories (Story 7.7)
-- UUID block: 11111111-7007-*
--   11111111-7007-4000-8000-000000000001 = alice (transaction owner)
--   11111111-7007-4000-8000-000000000002 = bob   (family partner)
--   11111111-7007-4000-8000-000000000003 = carol  (stranger)
--   11111111-7007-4000-8000-000000000010 = family_unit
--   11111111-7007-4000-8000-000000000020 = alice account
--   11111111-7007-4000-8000-000000000030 = shared transaction
--   11111111-7007-4000-8000-000000000031 = personal transaction

BEGIN;

SELECT plan(11);

-- SEED (all as postgres -- bypasses RLS)
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-7007-4000-8000-000000000001', 'alice-7007@test.com', '{}'),
  ('11111111-7007-4000-8000-000000000002', 'bob-7007@test.com',   '{}'),
  ('11111111-7007-4000-8000-000000000003', 'carol-7007@test.com', '{}');

SELECT public.seed_default_categories('11111111-7007-4000-8000-000000000001');
SELECT public.seed_default_categories('11111111-7007-4000-8000-000000000002');
SELECT public.seed_default_categories('11111111-7007-4000-8000-000000000003');

INSERT INTO public.accounts (id, user_id, name, type, currency, actual_balance_minor)
VALUES
  ('11111111-7007-4000-8000-000000000020', '11111111-7007-4000-8000-000000000001', 'Alice 7007 Cash', 'cash', 'USD', 100000);

INSERT INTO public.family_units (id)
VALUES ('11111111-7007-4000-8000-000000000010');

INSERT INTO public.family_members (family_unit_id, user_id, join_date, joined_at)
VALUES
  ('11111111-7007-4000-8000-000000000010', '11111111-7007-4000-8000-000000000001', '2026-01-01', '2026-01-01 10:00:00'),
  ('11111111-7007-4000-8000-000000000010', '11111111-7007-4000-8000-000000000002', '2026-01-01', '2026-01-01 10:00:00');

-- carol is NOT a family member (stranger)

-- Capture category IDs before role switching (avoids RLS interference in tests)
-- Grant SELECT to authenticated so these are readable inside authenticated test blocks
CREATE TEMP TABLE alice_expense_cat ON COMMIT DROP AS
  SELECT id FROM public.categories WHERE user_id = '11111111-7007-4000-8000-000000000001' AND type = 'expense' LIMIT 1;
GRANT SELECT ON alice_expense_cat TO authenticated;

CREATE TEMP TABLE bob_expense_cat ON COMMIT DROP AS
  SELECT id FROM public.categories WHERE user_id = '11111111-7007-4000-8000-000000000002' AND type = 'expense' LIMIT 1;
GRANT SELECT ON bob_expense_cat TO authenticated;

CREATE TEMP TABLE carol_expense_cat ON COMMIT DROP AS
  SELECT id FROM public.categories WHERE user_id = '11111111-7007-4000-8000-000000000003' AND type = 'expense' LIMIT 1;
GRANT SELECT ON carol_expense_cat TO authenticated;

-- Capture alice's active category count for T9 comparison
CREATE TEMP TABLE alice_cat_count ON COMMIT DROP AS
  SELECT count(1)::int AS cnt FROM public.categories
  WHERE user_id = '11111111-7007-4000-8000-000000000001' AND archived_at IS NULL;
GRANT SELECT ON alice_cat_count TO authenticated;

-- Shared transaction owned by alice
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, note, type, is_shared)
SELECT
  '11111111-7007-4000-8000-000000000030',
  '11111111-7007-4000-8000-000000000001',
  '11111111-7007-4000-8000-000000000020',
  (SELECT id FROM alice_expense_cat),
  5000, '2026-01-15', 'original note', 'expense', true;

-- Personal transaction owned by alice
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, note, type, is_shared)
SELECT
  '11111111-7007-4000-8000-000000000031',
  '11111111-7007-4000-8000-000000000001',
  '11111111-7007-4000-8000-000000000020',
  (SELECT id FROM alice_expense_cat),
  3000, '2026-01-15', 'personal note', 'expense', false;

-- T1: Owner (alice) can update note on shared transaction
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-7007-4000-8000-000000000001"}';

SELECT public.rpc_edit_shared_transaction(
  '11111111-7007-4000-8000-000000000030',
  'alice updated note',
  (SELECT id FROM alice_expense_cat)
);

SELECT is(
  (SELECT note FROM public.transactions WHERE id = '11111111-7007-4000-8000-000000000030'),
  'alice updated note',
  'T1: owner (alice) can update note on shared transaction'
);

-- T2: Activity trail entry written after owner edit
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT count(1)::int FROM public.activity_trail
   WHERE transaction_id = '11111111-7007-4000-8000-000000000030'
     AND user_id = '11111111-7007-4000-8000-000000000001'
     AND change_type = 'edit'),
  1,
  'T2: activity_trail entry written with alice user_id after owner edit'
);

-- T3: Partner (bob) can update note on shared transaction
-- Uses temp table for alice category (bob cannot see alice categories via RLS)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-7007-4000-8000-000000000002"}';

SELECT public.rpc_edit_shared_transaction(
  '11111111-7007-4000-8000-000000000030',
  'bob updated note',
  (SELECT id FROM alice_expense_cat)
);

SELECT is(
  (SELECT note FROM public.transactions WHERE id = '11111111-7007-4000-8000-000000000030'),
  'bob updated note',
  'T3: partner (bob) can update note on shared transaction'
);

-- T4: Activity trail entry written for partner edit
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT count(1)::int FROM public.activity_trail
   WHERE transaction_id = '11111111-7007-4000-8000-000000000030'
     AND user_id = '11111111-7007-4000-8000-000000000002'
     AND change_type = 'edit'),
  1,
  'T4: activity_trail entry written with bob user_id after partner edit'
);

-- T5: Activity trail visible to both partners via 0024 RLS (alice sees 2 total)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-7007-4000-8000-000000000001"}';

SELECT is(
  (SELECT count(1)::int FROM public.activity_trail
   WHERE transaction_id = '11111111-7007-4000-8000-000000000030'),
  2,
  'T5: alice sees both her and bobs activity_trail entries (0024 RLS partner visibility)'
);

-- T6: Stranger (carol) cannot edit shared transaction -> 42501
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-7007-4000-8000-000000000003"}';

SELECT throws_ok(
  $$ SELECT public.rpc_edit_shared_transaction(
    '11111111-7007-4000-8000-000000000030'::uuid,
    'hacked note',
    (SELECT id FROM carol_expense_cat)
  ) $$,
  '42501',
  NULL::text,
  'T6: stranger (carol) cannot edit shared transaction -> 42501'
);

-- T7: Personal transaction edit via this RPC -> P0001
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-7007-4000-8000-000000000001"}';

SELECT throws_ok(
  $$ SELECT public.rpc_edit_shared_transaction(
    '11111111-7007-4000-8000-000000000031'::uuid,
    'trying to edit personal via shared RPC',
    (SELECT id FROM alice_expense_cat)
  ) $$,
  'P0001',
  NULL::text,
  'T7: personal transaction edit via this RPC -> P0001'
);

-- T8: Category belonging to partner (bob) is rejected -> 23514
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-7007-4000-8000-000000000002"}';

SELECT throws_ok(
  $$ SELECT public.rpc_edit_shared_transaction(
    '11111111-7007-4000-8000-000000000030'::uuid,
    'bob note',
    (SELECT id FROM bob_expense_cat)
  ) $$,
  '23514',
  NULL::text,
  'T8: category belonging to partner (not tx owner) -> 23514'
);

-- T9: rpc_get_transaction_owner_categories returns owner categories for partner
-- Use EXISTS to avoid pgTAP set-returning function column ambiguity
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-7007-4000-8000-000000000002"}';

SELECT ok(
  EXISTS(
    SELECT 1 FROM public.rpc_get_transaction_owner_categories('11111111-7007-4000-8000-000000000030'::uuid)
    AS cats(cat_id, cat_name, cat_type)
  ),
  'T9: partner (bob) fetches owner (alice) categories via rpc -- returns rows'
);

-- T10: rpc_get_transaction_owner_categories returns empty for stranger
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-7007-4000-8000-000000000003"}';

SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM public.rpc_get_transaction_owner_categories('11111111-7007-4000-8000-000000000030'::uuid)
    AS cats(cat_id, cat_name, cat_type)
  ),
  'T10: stranger (carol) gets no rows from rpc_get_transaction_owner_categories'
);

-- T11: rpc_edit_shared_transaction has no amount_minor parameter (structural prevention, AC 8)
-- Assert the function accepts exactly 3 parameters (transaction_id, note, category_id)
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT pronargs FROM pg_proc
    JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
   WHERE pg_namespace.nspname = 'public'
     AND pg_proc.proname = 'rpc_edit_shared_transaction'),
  3,
  'T11: rpc_edit_shared_transaction has exactly 3 parameters — amount cannot be passed'
);

SELECT * FROM finish();
ROLLBACK;
