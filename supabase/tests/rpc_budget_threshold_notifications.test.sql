-- pgTAP tests for Story 9.3: rpc_process_budget_threshold_notifications
-- UUID block: 11111111-9003-*
--   alice:       11111111-9003-4000-8000-000000000001
--   family_unit: 11111111-9003-4000-8000-000000000010

BEGIN;

SELECT plan(12);

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed: alice user + profile (trigger auto-creates profile on auth.users INSERT)
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES (
  '11111111-9003-4000-8000-000000000001',
  'alice-9003@example.com',
  crypt('password', gen_salt('bf')),
  now(), now(), now()
);

-- Seed alice's account (needed for T10 transaction seed)
INSERT INTO public.accounts (id, user_id, name, type, actual_balance_minor, currency)
VALUES (
  '11111111-9003-4000-8000-000000000010',
  '11111111-9003-4000-8000-000000000001',
  'Alice Cash 9003', 'cash', 0, 'USD'
);

-- Seed alice's default categories (needed for T10)
SELECT seed_default_categories('11111111-9003-4000-8000-000000000001');

-- Seed a budget for alice (needed for T4/T7/T8 RPC JOIN on budgets.name and for T10)
-- Using custom period far in the past for T4/T5/T6/T7/T8 seeds so they don't conflict with T10
INSERT INTO public.budgets (id, user_id, name, limit_minor, period_type)
VALUES (
  '11111111-9003-4000-8000-000000000020',
  '11111111-9003-4000-8000-000000000001',
  'Groceries-9003',
  10000,
  'monthly'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T1: budget_threshold_events has budget_limit_minor column (bigint)
-- ──────────────────────────────────────────────────────────────────────────────
SELECT has_column(
  'public', 'budget_threshold_events', 'budget_limit_minor',
  'T1: budget_threshold_events has budget_limit_minor column'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T2: partial index idx_bte_unprocessed exists
-- ──────────────────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT count(*)::bigint FROM pg_indexes
   WHERE tablename = 'budget_threshold_events'
     AND indexname = 'idx_bte_unprocessed'),
  1::bigint,
  'T2: partial index idx_bte_unprocessed exists on budget_threshold_events'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T3: process-budget-threshold-notifications cron job registered at '1 * * * *'
-- ──────────────────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT count(*)::bigint FROM cron.job
   WHERE jobname = 'process-budget-threshold-notifications'
     AND schedule = '1 * * * *'),
  1::bigint,
  'T3: process-budget-threshold-notifications cron job registered at 1 * * * *'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed an unprocessed budget_threshold_events row for T4/T5/T6/T7/T8
-- Inserted directly as postgres superuser (INSERT revoked from authenticated)
-- Use a past period to avoid conflict with T10's current-period event
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO public.budget_threshold_events
  (id, budget_id, user_id, period_start, period_end, pct_used, actual_minor, budget_limit_minor, processed_at)
VALUES (
  '11111111-9003-4000-8000-000000000030',
  '11111111-9003-4000-8000-000000000020',
  '11111111-9003-4000-8000-000000000001',
  '2024-01-01',
  '2024-01-31',
  85.00,
  8500,
  10000,
  NULL
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T4: processing RPC fires a notification from an unprocessed event
-- ──────────────────────────────────────────────────────────────────────────────
SELECT public.rpc_process_budget_threshold_notifications();

SELECT is(
  (SELECT count(*)::bigint FROM public.notifications
   WHERE user_id = '11111111-9003-4000-8000-000000000001'
     AND type = 'budget_threshold'),
  1::bigint,
  'T4: rpc_process_budget_threshold_notifications inserts 1 notification for alice'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T5: event is marked processed after the RPC call
-- ──────────────────────────────────────────────────────────────────────────────
SELECT isnt(
  (SELECT processed_at FROM public.budget_threshold_events
   WHERE id = '11111111-9003-4000-8000-000000000030'),
  NULL,
  'T5: processed_at is set on the event row after processing'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T6: idempotency — calling the RPC again does not insert a second notification
-- ──────────────────────────────────────────────────────────────────────────────
SELECT public.rpc_process_budget_threshold_notifications();

SELECT is(
  (SELECT count(*)::bigint FROM public.notifications
   WHERE user_id = '11111111-9003-4000-8000-000000000001'
     AND type = 'budget_threshold'),
  1::bigint,
  'T6: idempotent — already processed event, notification count stays at 1'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T7: notification has correct title (budget name), body (pct_used), link (/budgets)
-- ──────────────────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT (
    title LIKE '%Groceries-9003%' AND
    body  LIKE '%85%'             AND
    link  = '/budgets'
  )::boolean
  FROM public.notifications
  WHERE user_id = '11111111-9003-4000-8000-000000000001'
    AND type = 'budget_threshold'
  LIMIT 1),
  true,
  'T7: notification has correct title (budget name), body (pct_used), and link'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T8: metadata JSONB contains all required fields
-- ──────────────────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT (
    metadata ? 'pct_used' AND
    metadata ? 'actual_minor' AND
    metadata ? 'budget_limit_minor' AND
    metadata ? 'currency' AND
    metadata ? 'period_start' AND
    metadata ? 'period_end'
  )::boolean
  FROM public.notifications
  WHERE user_id = '11111111-9003-4000-8000-000000000001'
    AND type = 'budget_threshold'
  LIMIT 1),
  true,
  'T8: notification metadata contains all required fields'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T9: UNIQUE constraint on (budget_id, period_start, period_end) — ON CONFLICT DO NOTHING
-- Attempt to INSERT a duplicate event for the same budget/period → count stays at 1
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO public.budget_threshold_events
  (budget_id, user_id, period_start, period_end, pct_used, actual_minor, budget_limit_minor)
VALUES (
  '11111111-9003-4000-8000-000000000020',
  '11111111-9003-4000-8000-000000000001',
  '2024-01-01',
  '2024-01-31',
  90.00,
  9000,
  10000
)
ON CONFLICT (budget_id, period_start, period_end) DO NOTHING;

SELECT is(
  (SELECT count(*)::bigint FROM public.budget_threshold_events
   WHERE budget_id = '11111111-9003-4000-8000-000000000020'
     AND period_start = '2024-01-01'
     AND period_end   = '2024-01-31'),
  1::bigint,
  'T9: UNIQUE constraint prevents duplicate event for same budget/period — ON CONFLICT DO NOTHING'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T10: rpc_check_budget_thresholds sets budget_limit_minor on new events
-- Full chain: budget → budget_categories → transaction reaching 80%
-- ──────────────────────────────────────────────────────────────────────────────

-- Seed a second budget for T10 (uses current period so rpc_check_budget_thresholds fires)
INSERT INTO public.budgets (id, user_id, name, limit_minor, period_type)
VALUES (
  '11111111-9003-4000-8000-000000000021',
  '11111111-9003-4000-8000-000000000001',
  'Food-9003',
  10000,
  'monthly'
);

-- Link the budget to alice's first expense category
INSERT INTO public.budget_categories (budget_id, category_id)
VALUES (
  '11111111-9003-4000-8000-000000000021',
  (SELECT id FROM public.categories
   WHERE user_id = '11111111-9003-4000-8000-000000000001'
     AND type = 'expense'
   LIMIT 1)
);

-- Seed a transaction at 85% of limit (8500 of 10000) in the current month
INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
VALUES (
  '11111111-9003-4000-8000-000000000040',
  '11111111-9003-4000-8000-000000000001',
  '11111111-9003-4000-8000-000000000010',
  (SELECT id FROM public.categories
   WHERE user_id = '11111111-9003-4000-8000-000000000001'
     AND type = 'expense'
   LIMIT 1),
  8500,
  CURRENT_DATE,
  'expense',
  false
);

SELECT public.rpc_check_budget_thresholds();

SELECT is(
  (SELECT budget_limit_minor FROM public.budget_threshold_events
   WHERE budget_id = '11111111-9003-4000-8000-000000000021'
   LIMIT 1),
  10000::bigint,
  'T10: rpc_check_budget_thresholds sets budget_limit_minor = 10000 on the new event'
);

-- T11/T12: EXECUTE privilege lockdown — neither authenticated nor anon can call
-- these SECURITY DEFINER RPCs directly (both are pg_cron-only). Guards against
-- PostgreSQL's default PUBLIC grant on newly created functions silently
-- re-opening this (E9 retro finding D0; migration 0048).
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.rpc_check_budget_thresholds()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.rpc_check_budget_thresholds()', 'EXECUTE'),
  'T11: neither authenticated nor anon has EXECUTE on rpc_check_budget_thresholds'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.rpc_process_budget_threshold_notifications()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.rpc_process_budget_threshold_notifications()', 'EXECUTE'),
  'T12: neither authenticated nor anon has EXECUTE on rpc_process_budget_threshold_notifications'
);

SELECT * FROM finish();
ROLLBACK;
