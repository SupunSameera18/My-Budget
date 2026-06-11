-- pgTAP cross-user RLS tests for macros (Story 5.1)
-- Owner UUID:   99999999-9999-4999-8999-999999999901
-- Attacker UUID: 99999999-9999-4999-8999-999999999902
-- Macro UUID:   99999999-9999-4999-8999-999999999903

BEGIN;

SELECT plan(8);

-- ── Setup ──────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email)
VALUES
  ('99999999-9999-4999-8999-999999999901', 'owner_macro@test.local'),
  ('99999999-9999-4999-8999-999999999902', 'attacker_macro@test.local')
ON CONFLICT (id) DO NOTHING;

-- Authenticate as owner to insert supporting records (accounts, categories, macro)
SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "99999999-9999-4999-8999-999999999901"}';

-- Insert a category for the owner (needed as FK for macro)
INSERT INTO public.categories (id, user_id, name, type)
VALUES ('99999999-9999-4999-8999-000000000001', '99999999-9999-4999-8999-999999999901', 'Macro Test Category', 'expense')
ON CONFLICT (id) DO NOTHING;

-- Insert an account for the owner (needed as FK for macro account_id)
INSERT INTO public.accounts (id, user_id, name, type, actual_balance_minor, currency)
VALUES ('99999999-9999-4999-8999-000000000002', '99999999-9999-4999-8999-999999999901', 'Macro Test Account', 'bank', 100000, 'USD')
ON CONFLICT (id) DO NOTHING;

-- Insert a macro for the owner
INSERT INTO public.macros (id, user_id, name, amount_minor, account_id, goal_id, category_id)
VALUES (
  '99999999-9999-4999-8999-999999999903',
  '99999999-9999-4999-8999-999999999901',
  'Netflix',
  1500,
  '99999999-9999-4999-8999-000000000002',
  NULL,
  '99999999-9999-4999-8999-000000000001'
);

-- ── Test 1: Anti-vacuous precondition — owner has 1 macro ────────────────────

SELECT is(
  (SELECT COUNT(*)::int FROM public.macros WHERE user_id = '99999999-9999-4999-8999-999999999901'),
  1,
  'Anti-vacuous: owner has 1 macro row'
);

-- ── Test 2: Owner can SELECT their own macro ──────────────────────────────────

SELECT is(
  (SELECT COUNT(*)::int FROM public.macros WHERE id = '99999999-9999-4999-8999-999999999903'),
  1,
  'Owner can SELECT their own macro (count = 1)'
);

-- ── Switch to attacker ────────────────────────────────────────────────────────

SET LOCAL "request.jwt.claims" TO '{"sub": "99999999-9999-4999-8999-999999999902"}';

-- ── Test 3: Attacker sees 0 rows for owner's macro ───────────────────────────

SELECT is(
  (SELECT COUNT(*)::int FROM public.macros WHERE user_id = '99999999-9999-4999-8999-999999999901'),
  0,
  'Attacker sees 0 rows for owner''s macro'
);

-- ── Test 4: Attacker cannot INSERT a macro with owner's user_id ──────────────

SELECT throws_ok(
  $$INSERT INTO public.macros (user_id, name, amount_minor, account_id, goal_id, category_id)
    VALUES (
      '99999999-9999-4999-8999-999999999901',
      'Attack Macro',
      500,
      '99999999-9999-4999-8999-000000000002',
      NULL,
      '99999999-9999-4999-8999-000000000001'
    )$$,
  '42501',
  NULL::text,
  'Attacker cannot INSERT a macro owned by owner (RLS WITH CHECK violation)'
);

-- ── Test 5: Attacker UPDATE on owner's macro affects 0 rows ──────────────────
-- Run the UPDATE as attacker (returns 0 rows), then verify from postgres role.

UPDATE public.macros SET name = 'Hacked'
WHERE id = '99999999-9999-4999-8999-999999999903';

SET LOCAL role TO postgres;

SELECT is(
  (SELECT name FROM public.macros WHERE id = '99999999-9999-4999-8999-999999999903'),
  'Netflix',
  'Attacker UPDATE on owner''s macro affects 0 rows (name unchanged after attacker UPDATE)'
);

SET LOCAL role TO authenticated;

-- ── Switch back to owner ──────────────────────────────────────────────────────

SET LOCAL "request.jwt.claims" TO '{"sub": "99999999-9999-4999-8999-999999999901"}';

-- ── Test 6: Owner DELETE on their own macro raises 42501 (REVOKE enforced) ───

SELECT throws_ok(
  $$DELETE FROM public.macros WHERE id = '99999999-9999-4999-8999-999999999903'$$,
  '42501',
  NULL::text,
  'Owner DELETE on own macro raises 42501 (REVOKE DELETE enforced)'
);

-- ── Test 7: CHECK constraint blocks INSERT with both account_id and goal_id non-null ──

SELECT throws_ok(
  $$INSERT INTO public.macros (user_id, name, amount_minor, account_id, goal_id, category_id)
    VALUES (
      '99999999-9999-4999-8999-999999999901',
      'Bad Macro',
      1000,
      '99999999-9999-4999-8999-000000000002',
      '99999999-9999-4999-8999-000000000002',
      '99999999-9999-4999-8999-000000000001'
    )$$,
  '23514',
  NULL::text,
  'CHECK constraint: both account_id and goal_id non-null raises 23514'
);

-- ── Test 8: CHECK constraint blocks INSERT with both account_id and goal_id null ──

SELECT throws_ok(
  $$INSERT INTO public.macros (user_id, name, amount_minor, account_id, goal_id, category_id)
    VALUES (
      '99999999-9999-4999-8999-999999999901',
      'Null Target Macro',
      1000,
      NULL,
      NULL,
      '99999999-9999-4999-8999-000000000001'
    )$$,
  '23514',
  NULL::text,
  'CHECK constraint: both account_id and goal_id null raises 23514'
);

SELECT * FROM finish();
ROLLBACK;
