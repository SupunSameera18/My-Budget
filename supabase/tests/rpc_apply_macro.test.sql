-- pgTAP golden tests for rpc_apply_macro and enhanced rpc_delete_transaction
--
-- UUID registry (aaaaaaaa-* block):
--   Owner:              aaaaaaaa-aaaa-4aaa-8aaa-000000000001
--   Attacker:           aaaaaaaa-aaaa-4aaa-8aaa-000000000002
--   Macro:              aaaaaaaa-aaaa-4aaa-8aaa-000000000003
--   Account:            aaaaaaaa-aaaa-4aaa-8aaa-000000000004  (balance 100000 initially)
--   Category:           aaaaaaaa-aaaa-4aaa-8aaa-000000000005  (type = 'expense')
--   Non-macro tx (T9):  aaaaaaaa-aaaa-4aaa-8aaa-000000000006
--   Linked tx A (T10):  aaaaaaaa-aaaa-4aaa-8aaa-000000000007
--   Linked tx B (T10):  aaaaaaaa-aaaa-4aaa-8aaa-000000000008
--   Manual app_id (T10):aaaaaaaa-aaaa-4aaa-8aaa-000000000009

BEGIN;

SELECT plan(13);

-- ── Setup ──────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000001', 'owner_apply_macro@test.local'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000002', 'attacker_apply_macro@test.local')
ON CONFLICT (id) DO NOTHING;

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-000000000001"}';

INSERT INTO public.categories (id, user_id, name, type)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', 'Macro Apply Category', 'expense')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.accounts (id, user_id, name, type, actual_balance_minor, currency)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', 'Macro Apply Account', 'bank', 100000, 'USD')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.macros (id, user_id, name, amount_minor, account_id, goal_id, category_id)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', 'Netflix', 1500,
        'aaaaaaaa-aaaa-4aaa-8aaa-000000000004', NULL, 'aaaaaaaa-aaaa-4aaa-8aaa-000000000005')
ON CONFLICT (id) DO NOTHING;

-- ── Test 1: Anti-vacuous — owner has macro and account ──────────────────────

SELECT is(
  (SELECT COUNT(*)::int FROM public.macros
   WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003'
     AND user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001'),
  1,
  'Anti-vacuous: owner has 1 macro row'
);

-- ── Apply macro, store result for tests 2–6 ─────────────────────────────────

CREATE TEMP TABLE t_apply_result (application_id UUID) ON COMMIT DROP;
INSERT INTO t_apply_result
  SELECT public.rpc_apply_macro('aaaaaaaa-aaaa-4aaa-8aaa-000000000003'::UUID);

-- ── Test 2: rpc_apply_macro returns non-null UUID ────────────────────────────

SELECT ok(
  (SELECT application_id FROM t_apply_result) IS NOT NULL,
  'rpc_apply_macro returns non-null UUID'
);

-- ── Test 3: Transaction created with correct fields ──────────────────────────
-- Expects: account_id=004, amount_minor=1500, type=expense, date=today, not archived

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE macro_application_id = (SELECT application_id FROM t_apply_result)
     AND account_id   = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004'
     AND amount_minor = 1500
     AND type         = 'expense'
     AND date         = CURRENT_DATE
     AND archived_at IS NULL
     AND user_id      = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001'),
  1,
  'Transaction created with correct fields (account, amount=1500, type=expense, date=today, not archived)'
);

-- ── Test 4: Account balance updated correctly ────────────────────────────────
-- expense: 100000 - 1500 = 98500

SELECT is(
  (SELECT actual_balance_minor FROM public.accounts
   WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004'),
  98500::bigint,
  'Account balance updated correctly: 100000 - 1500 = 98500 (expense macro)'
);

-- ── Test 5: macros.last_used_at is set (no longer NULL) ─────────────────────

SELECT ok(
  (SELECT last_used_at IS NOT NULL FROM public.macros
   WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003'),
  'macros.last_used_at is set after rpc_apply_macro'
);

-- ── Test 6: Returned UUID matches transaction's macro_application_id ─────────

SELECT is(
  (SELECT macro_application_id FROM public.transactions
   WHERE user_id             = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001'
     AND macro_application_id IS NOT NULL
   LIMIT 1),
  (SELECT application_id FROM t_apply_result),
  'Returned UUID matches transaction.macro_application_id'
);

-- ── Test 7: Cross-user — attacker cannot apply owner's macro (P0002) ─────────

SET LOCAL "request.jwt.claims" TO '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-000000000002"}';

SELECT throws_ok(
  $$SELECT public.rpc_apply_macro('aaaaaaaa-aaaa-4aaa-8aaa-000000000003'::UUID)$$,
  'P0002',
  NULL::text,
  'Cross-user: attacker cannot apply owner''s macro (raises P0002)'
);

-- ── Test 8: Archived macro raises P0002 ─────────────────────────────────────
-- Archive the macro via postgres (owner RLS UPDATE policy cannot bypass archived_at guard)

SET LOCAL role TO postgres;
UPDATE public.macros SET archived_at = NOW() WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003';

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-000000000001"}';

SELECT throws_ok(
  $$SELECT public.rpc_apply_macro('aaaaaaaa-aaaa-4aaa-8aaa-000000000003'::UUID)$$,
  'P0002',
  NULL::text,
  'Archived macro raises P0002'
);

-- ── Setup for rpc_delete_transaction tests (9–12) ────────────────────────────
-- Direct inserts via postgres (bypass RLS); balances manually maintained.
-- State after macro apply: account balance = 98500.

SET LOCAL role TO postgres;

-- Non-macro transaction (test 9): expense 2000 → balance 98500 - 2000 = 96500
INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-000000000006', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
        'aaaaaaaa-aaaa-4aaa-8aaa-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000005',
        2000, CURRENT_DATE, 'expense');
UPDATE public.accounts SET actual_balance_minor = 96500 WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004';

-- Linked tx A + B (tests 10–11): expense 300 each, shared application_id
-- balance 96500 - 300 - 300 = 95900
INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type, macro_application_id)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000007', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
   'aaaaaaaa-aaaa-4aaa-8aaa-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000005',
   300, CURRENT_DATE, 'expense', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000009'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000008', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
   'aaaaaaaa-aaaa-4aaa-8aaa-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000005',
   300, CURRENT_DATE, 'expense', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000009');
UPDATE public.accounts SET actual_balance_minor = 95900 WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004';

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-000000000001"}';

-- ── Test 9: rpc_delete_transaction single path (regression) ─────────────────
-- Delete non-macro tx006 → balance 95900 + 2000 = 97900; tx006 soft-deleted

SELECT public.rpc_delete_transaction('aaaaaaaa-aaaa-4aaa-8aaa-000000000006'::UUID);

SELECT ok(
  (SELECT archived_at IS NOT NULL FROM public.transactions
   WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000006'),
  'rpc_delete_transaction single path: non-macro transaction soft-deleted'
);

-- ── Test 10: rpc_delete_transaction linked-set deletes all ──────────────────
-- Delete tx007 → linked-set delete also removes tx008 (same application_id 009)
-- Balance: 97900 + 300 + 300 = 98500

SELECT public.rpc_delete_transaction('aaaaaaaa-aaaa-4aaa-8aaa-000000000007'::UUID);

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE macro_application_id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000009'
     AND archived_at IS NOT NULL
     AND user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001'),
  2,
  'rpc_delete_transaction linked-set: both linked transactions are soft-deleted'
);

-- ── Test 11: rpc_delete_transaction linked-set reverses all balances ─────────
-- After deleting both linked txs (expense 300 each): 97900 + 300 + 300 = 98500

SELECT is(
  (SELECT actual_balance_minor FROM public.accounts
   WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004'),
  98500::bigint,
  'rpc_delete_transaction linked-set: account balance fully restored (98500)'
);

-- ── Test 12: Anti-vacuous regression ────────────────────────────────────────
-- Proves test 9 actually ran: tx006 remains soft-deleted

SELECT ok(
  (SELECT archived_at IS NOT NULL FROM public.transactions
   WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000006'),
  'Anti-vacuous regression: non-macro tx (test 9) still has archived_at IS NOT NULL'
);

-- ── Test 13: Archived category — applying a macro whose category is archived
-- raises an error. The function's guard checks the category with archived_at IS NULL,
-- so an archived category causes the "not found, not owned, or archived" exception.
-- This documents the deliberate design: archived categories block macro application.
-- [Task 9 — archived-category delete path, story 5-2a]
-- ──────────────────────────────────────────────────────────────────────────────

-- First unarchive the macro so it's valid again, then archive only its category
SET LOCAL role TO postgres;
UPDATE public.macros SET archived_at = NULL WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003';

-- Archive the category directly as postgres (bypass RLS)
UPDATE public.categories
  SET archived_at = NOW()
  WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000005';

-- Reset account balance so the macro application is predictable
UPDATE public.accounts SET actual_balance_minor = 100000 WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004';

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-000000000001"}';

SELECT throws_ok(
  $$ SELECT public.rpc_apply_macro('aaaaaaaa-aaaa-4aaa-8aaa-000000000003'::UUID) $$,
  'P0001',
  'Macro category not found, not owned, or archived',
  'Test 13: rpc_apply_macro raises error when macro''s category is archived'
);

SELECT * FROM finish();
ROLLBACK;
