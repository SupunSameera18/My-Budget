-- pgTAP tests for migration 0055: schema validation constraints
-- UUID block: 11111111-5500-4000-8000-*
--   alice:        11111111-5500-4000-8000-000000000001
--   alice_acct_a: 11111111-5500-4000-8000-000000000010  (savings, 0 balance)
--   alice_acct_b: 11111111-5500-4000-8000-000000000011  (bank, 100000 balance)
--   alice_cat:    11111111-5500-4000-8000-000000000020  (expense category)
--   alice_subcat: 11111111-5500-4000-8000-000000000030  (subcategory)

BEGIN;
SELECT plan(17);

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed (postgres role — trigger creates profile automatically)
-- ──────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('11111111-5500-4000-8000-000000000001', 'task5alice@test.com', '{}');

-- Seed account A (savings, 0 balance) and B (bank, with funds for transfer tests)
INSERT INTO public.accounts (id, user_id, name, type, actual_balance_minor, currency)
VALUES
  ('11111111-5500-4000-8000-000000000010',
   '11111111-5500-4000-8000-000000000001',
   'Savings', 'savings', 0, 'USD'),
  ('11111111-5500-4000-8000-000000000011',
   '11111111-5500-4000-8000-000000000001',
   'Checking', 'bank', 100000, 'USD');

-- Seed category
INSERT INTO public.categories (id, user_id, name, type)
VALUES ('11111111-5500-4000-8000-000000000020',
        '11111111-5500-4000-8000-000000000001',
        'Food', 'expense');

-- Seed subcategory
INSERT INTO public.subcategories (id, user_id, category_id, name)
VALUES ('11111111-5500-4000-8000-000000000030',
        '11111111-5500-4000-8000-000000000001',
        '11111111-5500-4000-8000-000000000020',
        'Groceries');

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles.reminder_time CHECK
-- ─────────────────────────────────────────────────────────────────────────────

-- T1: profile was created by the trigger (sanity check)
SELECT is(
  (SELECT count(*)::bigint FROM public.profiles
   WHERE user_id = '11111111-5500-4000-8000-000000000001'),
  1::bigint,
  'T1: handle_new_user trigger created profile on auth.users INSERT'
);

-- T2: reminder_time accepts valid HH:MM value
UPDATE public.profiles
  SET reminder_time = '20:30'
  WHERE user_id = '11111111-5500-4000-8000-000000000001';

SELECT is(
  (SELECT reminder_time FROM public.profiles
   WHERE user_id = '11111111-5500-4000-8000-000000000001'),
  '20:30',
  'T2: reminder_time accepts valid HH:MM value'
);

-- T3: reminder_time CHECK rejects bad format (single digits — not HH:MM)
SELECT throws_ok(
  $$UPDATE public.profiles SET reminder_time = '8:5'
    WHERE user_id = '11111111-5500-4000-8000-000000000001'$$,
  '23514',
  NULL::text,
  'T3: reminder_time CHECK rejects H:M format (missing leading zeros)'
);

-- T4: reminder_time CHECK rejects arbitrary string
SELECT throws_ok(
  $$UPDATE public.profiles SET reminder_time = 'morning'
    WHERE user_id = '11111111-5500-4000-8000-000000000001'$$,
  '23514',
  NULL::text,
  'T4: reminder_time CHECK rejects non-time string'
);

-- T5: reminder_time NULL allowed (reminder disabled)
UPDATE public.profiles
  SET reminder_time = NULL
  WHERE user_id = '11111111-5500-4000-8000-000000000001';

SELECT is(
  (SELECT reminder_time FROM public.profiles
   WHERE user_id = '11111111-5500-4000-8000-000000000001'),
  NULL::text,
  'T5: reminder_time NULL allowed (reminder disabled)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- accounts.name length CHECK
-- ─────────────────────────────────────────────────────────────────────────────

-- T6: account name accepts max length (50 chars)
UPDATE public.accounts
  SET name = repeat('a', 50)
  WHERE id = '11111111-5500-4000-8000-000000000010';

SELECT is(
  (SELECT char_length(name) FROM public.accounts
   WHERE id = '11111111-5500-4000-8000-000000000010'),
  50,
  'T6: account name accepts 50 characters'
);

-- T7: account name CHECK rejects > 50 chars
SELECT throws_ok(
  $$UPDATE public.accounts SET name = repeat('x', 51)
    WHERE id = '11111111-5500-4000-8000-000000000010'$$,
  '23514',
  NULL::text,
  'T7: accounts_name_length CHECK rejects 51-char name'
);

-- T8: account name CHECK rejects empty string
SELECT throws_ok(
  $$UPDATE public.accounts SET name = ''
    WHERE id = '11111111-5500-4000-8000-000000000010'$$,
  '23514',
  NULL::text,
  'T8: accounts_name_length CHECK rejects empty name'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- categories.name length CHECK
-- ─────────────────────────────────────────────────────────────────────────────

-- T9: category name accepts max length (50 chars)
UPDATE public.categories
  SET name = repeat('b', 50)
  WHERE id = '11111111-5500-4000-8000-000000000020';

SELECT is(
  (SELECT char_length(name) FROM public.categories
   WHERE id = '11111111-5500-4000-8000-000000000020'),
  50,
  'T9: category name accepts 50 characters'
);

-- T10: category name CHECK rejects > 50 chars
SELECT throws_ok(
  $$UPDATE public.categories SET name = repeat('y', 51)
    WHERE id = '11111111-5500-4000-8000-000000000020'$$,
  '23514',
  NULL::text,
  'T10: categories_name_length CHECK rejects 51-char name'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- subcategories.name length CHECK
-- ─────────────────────────────────────────────────────────────────────────────

-- T11: subcategory name accepts max length (50 chars)
UPDATE public.subcategories
  SET name = repeat('c', 50)
  WHERE id = '11111111-5500-4000-8000-000000000030';

SELECT is(
  (SELECT char_length(name) FROM public.subcategories
   WHERE id = '11111111-5500-4000-8000-000000000030'),
  50,
  'T11: subcategory name accepts 50 characters'
);

-- T12: subcategory name CHECK rejects > 50 chars
SELECT throws_ok(
  $$UPDATE public.subcategories SET name = repeat('z', 51)
    WHERE id = '11111111-5500-4000-8000-000000000030'$$,
  '23514',
  NULL::text,
  'T12: subcategories_name_length CHECK rejects 51-char name'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_internal_transfer p_date range guard (as authenticated/alice)
-- ─────────────────────────────────────────────────────────────────────────────

-- Reset account A name to valid before testing as authenticated (avoid name-length issue)
UPDATE public.accounts SET name = 'Savings' WHERE id = '11111111-5500-4000-8000-000000000010';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-5500-4000-8000-000000000001"}';

-- T13: internal transfer rejects date before 1990
SELECT throws_ok(
  $$SELECT public.rpc_internal_transfer(
      '11111111-5500-4000-8000-000000000011'::uuid,
      '11111111-5500-4000-8000-000000000010'::uuid,
      1000::bigint,
      '1989-12-31'::date
    )$$,
  '22008',
  NULL::text,
  'T13: rpc_internal_transfer rejects date before 1990-01-01'
);

-- T14: internal transfer rejects date after 2100
SELECT throws_ok(
  $$SELECT public.rpc_internal_transfer(
      '11111111-5500-4000-8000-000000000011'::uuid,
      '11111111-5500-4000-8000-000000000010'::uuid,
      1000::bigint,
      '2101-01-01'::date
    )$$,
  '22008',
  NULL::text,
  'T14: rpc_internal_transfer rejects date after 2100-12-31'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_external_transfer p_date range guard (still as authenticated/alice)
-- ─────────────────────────────────────────────────────────────────────────────

-- T15: external transfer rejects date before 1990
SELECT throws_ok(
  $$SELECT public.rpc_external_transfer(
      '11111111-5500-4000-8000-000000000010'::uuid,
      'in',
      500::bigint,
      '1989-12-31'::date
    )$$,
  '22008',
  NULL::text,
  'T15: rpc_external_transfer rejects date before 1990-01-01'
);

-- T16: external transfer rejects date after 2100
SELECT throws_ok(
  $$SELECT public.rpc_external_transfer(
      '11111111-5500-4000-8000-000000000010'::uuid,
      'in',
      500::bigint,
      '2101-01-01'::date
    )$$,
  '22008',
  NULL::text,
  'T16: rpc_external_transfer rejects date after 2100-12-31'
);

-- T17: external transfer accepts a valid date within range
SELECT lives_ok(
  $$SELECT public.rpc_external_transfer(
      '11111111-5500-4000-8000-000000000010'::uuid,
      'in',
      500::bigint,
      '2026-06-17'::date
    )$$,
  'T17: rpc_external_transfer accepts a valid date within range (2026-06-17)'
);

SELECT * FROM finish();
ROLLBACK;
