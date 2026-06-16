-- pgTAP tests for Story 9.4: rpc_send_month_end_summary_notifications
-- UUID block: 11111111-9004-*
--   alice:   11111111-9004-4000-8000-000000000001 (3 tx in previous month — gets notified)
--   bob:     11111111-9004-4000-8000-000000000002 (0 tx — never notified)
--   charlie: 11111111-9004-4000-8000-000000000003 (tx only in current month — not notified)
--
-- Date arithmetic is always relative to CURRENT_DATE so the suite stays correct
-- regardless of when it runs (no hardcoded calendar dates for transaction seeds).

BEGIN;

SELECT plan(10);

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed: alice, bob, charlie users (trigger auto-creates profile on auth.users INSERT)
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('11111111-9004-4000-8000-000000000001', 'alice-9004@example.com',   crypt('password', gen_salt('bf')), now(), now(), now()),
  ('11111111-9004-4000-8000-000000000002', 'bob-9004@example.com',     crypt('password', gen_salt('bf')), now(), now(), now()),
  ('11111111-9004-4000-8000-000000000003', 'charlie-9004@example.com', crypt('password', gen_salt('bf')), now(), now(), now());

-- Accounts (required for transactions.account_id)
INSERT INTO public.accounts (id, user_id, name, type, actual_balance_minor, currency)
VALUES
  ('11111111-9004-4000-8000-000000000010', '11111111-9004-4000-8000-000000000001', 'Alice Cash 9004',   'cash', 0, 'USD'),
  ('11111111-9004-4000-8000-000000000011', '11111111-9004-4000-8000-000000000002', 'Bob Cash 9004',     'cash', 0, 'USD'),
  ('11111111-9004-4000-8000-000000000012', '11111111-9004-4000-8000-000000000003', 'Charlie Cash 9004', 'cash', 0, 'USD');

-- Default categories (transactions.category_id is NOT NULL)
SELECT seed_default_categories('11111111-9004-4000-8000-000000000001');
SELECT seed_default_categories('11111111-9004-4000-8000-000000000002');
SELECT seed_default_categories('11111111-9004-4000-8000-000000000003');

-- Alice: 3 transactions in the previous month, including one on the last day
-- (boundary check for T9 — last day of previous month must still count)
INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
VALUES
  ('11111111-9004-4000-8000-000000000020', '11111111-9004-4000-8000-000000000001', '11111111-9004-4000-8000-000000000010',
   (SELECT id FROM public.categories WHERE user_id = '11111111-9004-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
   1500, (CURRENT_DATE - interval '1 month')::date, 'expense', false),
  ('11111111-9004-4000-8000-000000000021', '11111111-9004-4000-8000-000000000001', '11111111-9004-4000-8000-000000000010',
   (SELECT id FROM public.categories WHERE user_id = '11111111-9004-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
   2500, (CURRENT_DATE - interval '1 month')::date, 'expense', false),
  ('11111111-9004-4000-8000-000000000022', '11111111-9004-4000-8000-000000000001', '11111111-9004-4000-8000-000000000010',
   (SELECT id FROM public.categories WHERE user_id = '11111111-9004-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
   3500, (date_trunc('month', CURRENT_DATE) - interval '1 day')::date, 'expense', false);

-- Bob: no transactions at all.

-- Charlie: a transaction in the CURRENT month only — must not trigger a summary.
INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
VALUES (
  '11111111-9004-4000-8000-000000000030', '11111111-9004-4000-8000-000000000003', '11111111-9004-4000-8000-000000000012',
  (SELECT id FROM public.categories WHERE user_id = '11111111-9004-4000-8000-000000000003' AND type = 'expense' LIMIT 1),
  1000, CURRENT_DATE, 'expense', false
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T1: cron job registered with correct schedule
-- ──────────────────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT count(*)::bigint FROM cron.job
   WHERE jobname = 'month-end-summary-notifications'
     AND schedule = '5 0 1 * *'),
  1::bigint,
  'T1: month-end-summary cron job registered with correct schedule'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- Fire the RPC once — covers T2/T5/T6/T7/T8/T9 (alice side)
-- ──────────────────────────────────────────────────────────────────────────────
SELECT public.rpc_send_month_end_summary_notifications();

-- T2: fires notification for user with previous-month transactions
SELECT is(
  (SELECT count(*)::bigint FROM public.notifications
   WHERE user_id = '11111111-9004-4000-8000-000000000001'
     AND type = 'month_end_summary'),
  1::bigint,
  'T2: alice (had previous-month transactions) gets exactly 1 month_end_summary notification'
);

-- T3: no notification for user with zero transactions
SELECT is(
  (SELECT count(*)::bigint FROM public.notifications
   WHERE user_id = '11111111-9004-4000-8000-000000000002'
     AND type = 'month_end_summary'),
  0::bigint,
  'T3: bob (zero transactions) gets no month_end_summary notification'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T4: idempotency — calling the RPC again does not insert a second notification
-- ──────────────────────────────────────────────────────────────────────────────
SELECT public.rpc_send_month_end_summary_notifications();

SELECT is(
  (SELECT count(*)::bigint FROM public.notifications
   WHERE user_id = '11111111-9004-4000-8000-000000000001'
     AND type = 'month_end_summary'),
  1::bigint,
  'T4: idempotent — second call does not double-notify alice'
);

-- T5: notification title contains the previous month's name and year
SELECT is(
  (SELECT title FROM public.notifications
   WHERE user_id = '11111111-9004-4000-8000-000000000001'
     AND type = 'month_end_summary'
   LIMIT 1),
  to_char(date_trunc('month', CURRENT_DATE - interval '1 month'), 'FMMonth YYYY') || ' summary is ready',
  'T5: notification title contains previous month name and year'
);

-- T6: notification link format is /summary?month=YYYY-MM
SELECT is(
  (SELECT link FROM public.notifications
   WHERE user_id = '11111111-9004-4000-8000-000000000001'
     AND type = 'month_end_summary'
   LIMIT 1),
  '/summary?month=' || to_char(date_trunc('month', CURRENT_DATE - interval '1 month'), 'YYYY-MM'),
  'T6: notification link points to /summary?month=YYYY-MM for the previous month'
);

-- T7: metadata JSONB contains all required fields
SELECT is(
  (SELECT (
    metadata ? 'month_label'  AND
    metadata ? 'tx_count'     AND
    metadata ? 'period_start' AND
    metadata ? 'period_end'
  )::boolean
  FROM public.notifications
  WHERE user_id = '11111111-9004-4000-8000-000000000001'
    AND type = 'month_end_summary'
  LIMIT 1),
  true,
  'T7: notification metadata contains month_label, tx_count, period_start, period_end'
);

-- T8: tx_count in metadata reflects the 3 seeded transactions
SELECT is(
  (SELECT metadata->>'tx_count' FROM public.notifications
   WHERE user_id = '11111111-9004-4000-8000-000000000001'
     AND type = 'month_end_summary'
   LIMIT 1),
  '3',
  'T8: metadata tx_count is 3 for alice''s 3 seeded previous-month transactions'
);

-- T9: boundary check — last-day-of-previous-month transaction is included (alice already
-- notified above, which included a transaction dated exactly v_prev_month_end), and a user
-- with transactions exclusively in the CURRENT month (charlie) gets no notification.
SELECT is(
  (SELECT count(*)::bigint FROM public.notifications
   WHERE user_id = '11111111-9004-4000-8000-000000000003'
     AND type = 'month_end_summary'),
  0::bigint,
  'T9: charlie (transactions only in current month) gets no month_end_summary notification'
);

-- T10: EXECUTE privilege lockdown — neither authenticated nor anon can call this
-- SECURITY DEFINER RPC directly (it's pg_cron-only). Guards against PostgreSQL's
-- default PUBLIC grant on newly created functions silently re-opening this.
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.rpc_send_month_end_summary_notifications()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.rpc_send_month_end_summary_notifications()', 'EXECUTE'),
  'T10: neither authenticated nor anon has EXECUTE on rpc_send_month_end_summary_notifications'
);

SELECT * FROM finish();
ROLLBACK;
