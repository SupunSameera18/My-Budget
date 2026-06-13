-- Story 7.5: transaction_defaults JSONB + rpc_log_transaction is_shared
-- UUID block: 11111111-7005-* (story 7.5 convention)
--   11111111-7005-4000-8000-000000000001 = alice
--   11111111-7005-4000-8000-000000000002 = bob (family member)
--   11111111-7005-4000-8000-000000000003 = carol (stranger)
--   11111111-7005-4000-8000-000000000010 = family_unit
--   11111111-7005-4000-8000-000000000011 = alice account
--
-- Scenarios:
--   T1: transaction_defaults column exists on profiles
--   T2: owner can UPDATE own transaction_defaults; value stored correctly
--   T3: cross-user transaction_defaults UPDATE blocked by RLS (0 rows affected)
--   T4: rpc_log_transaction with p_is_shared=true stores is_shared=true
--   T5: partner (bob) can see alice's shared transaction via auth_can_view_transaction
--   T6: stranger (carol) cannot see alice's shared transaction

BEGIN;

SELECT plan(6);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED (as postgres — bypasses RLS)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-7005-4000-8000-000000000001', 'alice-7005@test.com', '{}'),
  ('11111111-7005-4000-8000-000000000002', 'bob-7005@test.com',   '{}'),
  ('11111111-7005-4000-8000-000000000003', 'carol-7005@test.com', '{}');

SELECT public.seed_default_categories('11111111-7005-4000-8000-000000000001');

INSERT INTO public.accounts (id, user_id, name, type, currency, actual_balance_minor)
VALUES
  ('11111111-7005-4000-8000-000000000011', '11111111-7005-4000-8000-000000000001', 'Alice 7005 Cash', 'cash', 'USD', 100000);

INSERT INTO public.family_units (id)
VALUES ('11111111-7005-4000-8000-000000000010');

INSERT INTO public.family_members (family_unit_id, user_id, join_date, hide_personal)
VALUES
  ('11111111-7005-4000-8000-000000000010', '11111111-7005-4000-8000-000000000001', '2025-01-01', false),
  ('11111111-7005-4000-8000-000000000010', '11111111-7005-4000-8000-000000000002', '2025-01-01', false);

-- ═══════════════════════════════════════════════════════════════════════════
-- T1: transaction_defaults column exists on profiles
-- ═══════════════════════════════════════════════════════════════════════════
SELECT has_column(
  'public',
  'profiles',
  'transaction_defaults',
  'T1: transaction_defaults column exists on public.profiles'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- T2: owner can UPDATE own transaction_defaults
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-7005-4000-8000-000000000001"}';
SET LOCAL ROLE authenticated;

UPDATE public.profiles
SET transaction_defaults = '{"defaultType": "shared", "defaultSplitMethod": "equal"}'::jsonb
WHERE user_id = '11111111-7005-4000-8000-000000000001';

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT transaction_defaults->>'defaultType'
   FROM public.profiles
   WHERE user_id = '11111111-7005-4000-8000-000000000001'),
  'shared',
  'T2: owner can UPDATE own transaction_defaults; defaultType stored correctly'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- T3: cross-user UPDATE of transaction_defaults blocked by RLS (0 rows)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE postgres;
UPDATE public.profiles
SET transaction_defaults = NULL
WHERE user_id = '11111111-7005-4000-8000-000000000001';

SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-7005-4000-8000-000000000002"}';
SET LOCAL ROLE authenticated;

UPDATE public.profiles
SET transaction_defaults = '{"defaultType": "shared"}'::jsonb
WHERE user_id = '11111111-7005-4000-8000-000000000001';

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT transaction_defaults
   FROM public.profiles
   WHERE user_id = '11111111-7005-4000-8000-000000000001'),
  NULL::jsonb,
  'T3: cross-user transaction_defaults UPDATE blocked by RLS'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- T4: rpc_log_transaction with p_is_shared=true stores is_shared=true
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-7005-4000-8000-000000000001"}';
SET LOCAL ROLE authenticated;

SELECT public.rpc_log_transaction(
  '11111111-7005-4000-8000-000000000011',  -- p_account_id (alice's account)
  (SELECT id FROM public.categories
   WHERE user_id = '11111111-7005-4000-8000-000000000001'
     AND type = 'expense'
   LIMIT 1),                               -- p_category_id
  500,                                     -- p_amount_minor
  '2025-06-01'::date,                      -- p_date
  NULL,                                    -- p_note
  NULL,                                    -- p_subcategory_id
  true                                     -- p_is_shared
);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT is_shared FROM public.transactions
   WHERE user_id = '11111111-7005-4000-8000-000000000001'
     AND is_shared = true
   LIMIT 1),
  true,
  'T4: rpc_log_transaction with p_is_shared=true stores is_shared=true'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- T5: partner (bob) can see alice's shared transaction
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-7005-4000-8000-000000000002"}';
SET LOCAL ROLE authenticated;

SELECT is(
  public.auth_can_view_transaction(
    '11111111-7005-4000-8000-000000000001'::uuid,  -- owner = alice
    true,                                           -- is_shared
    '2025-06-01'::date                              -- date
  ),
  true,
  'T5: family partner (bob) can see alice shared transaction'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- T6: stranger (carol) cannot see alice's shared transaction
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-7005-4000-8000-000000000003"}';
SET LOCAL ROLE authenticated;

SELECT is(
  public.auth_can_view_transaction(
    '11111111-7005-4000-8000-000000000001'::uuid,  -- owner = alice
    true,                                           -- is_shared
    '2025-06-01'::date                              -- date
  ),
  false,
  'T6: stranger (carol) cannot see alice shared transaction'
);

SELECT * FROM finish();
ROLLBACK;
