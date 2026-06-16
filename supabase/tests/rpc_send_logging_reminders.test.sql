-- pgTAP tests for Story 9.2: rpc_send_logging_reminders
-- UUID block: 11111111-9002-*
--   alice: 11111111-9002-4000-8000-000000000001
--   bob:   11111111-9002-4000-8000-000000000002

BEGIN;

SELECT plan(8);

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed users
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES (
  '11111111-9002-4000-8000-000000000001',
  'alice-9002@example.com',
  crypt('password', gen_salt('bf')),
  now(), now(), now()
);

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES (
  '11111111-9002-4000-8000-000000000002',
  'bob-9002@example.com',
  crypt('password', gen_salt('bf')),
  now(), now(), now()
);

-- alice's account (needed for T6 transaction seed)
INSERT INTO public.accounts (id, user_id, name, type, actual_balance_minor, currency)
VALUES (
  '11111111-9002-4000-8000-000000000010',
  '11111111-9002-4000-8000-000000000001',
  'Alice Cash', 'cash', 0, 'USD'
);

-- alice's default categories (needed for T6 transaction seed)
SELECT seed_default_categories('11111111-9002-4000-8000-000000000001');

-- ──────────────────────────────────────────────────────────────────────────────
-- T1: reminder_enabled defaults to false
-- ──────────────────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT column_default
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'profiles'
     AND column_name = 'reminder_enabled'),
  'false',
  'T1: reminder_enabled defaults to false'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T2: profiles has reminder_time column (text, nullable)
-- ──────────────────────────────────────────────────────────────────────────────
SELECT has_column(
  'public', 'profiles', 'reminder_time',
  'T2: profiles has reminder_time column'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T3: profiles has reminder_timezone column (text, nullable)
-- ──────────────────────────────────────────────────────────────────────────────
SELECT has_column(
  'public', 'profiles', 'reminder_timezone',
  'T3: profiles has reminder_timezone column'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T4: pg_cron job registered with correct schedule
-- ──────────────────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT count(*)::bigint FROM cron.job WHERE jobname = 'send-logging-reminders'),
  1::bigint,
  'T4: send-logging-reminders cron job registered'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T5: idempotency — already notified today → no new notification inserted
-- ──────────────────────────────────────────────────────────────────────────────
UPDATE public.profiles
  SET reminder_enabled = true,
      reminder_time = TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'HH24:MI'),
      reminder_timezone = 'UTC'
  WHERE user_id = '11111111-9002-4000-8000-000000000001';

-- Insert a prior logging_reminder for today to trigger idempotency guard
INSERT INTO public.notifications (user_id, type, title, body, link)
VALUES (
  '11111111-9002-4000-8000-000000000001',
  'logging_reminder',
  'Daily log reminder',
  'Don''t forget to log today''s expenses.',
  '/transactions/new'
);

SELECT public.rpc_send_logging_reminders();

SELECT is(
  (SELECT count(*)::bigint FROM public.notifications
   WHERE user_id = '11111111-9002-4000-8000-000000000001'
     AND type = 'logging_reminder'),
  1::bigint,
  'T5: idempotent — already notified today, no second notification inserted'
);

-- Clean up T5 notification
DELETE FROM public.notifications WHERE user_id = '11111111-9002-4000-8000-000000000001';

-- ──────────────────────────────────────────────────────────────────────────────
-- T6: already logged a transaction today → skip (no notification inserted)
-- ──────────────────────────────────────────────────────────────────────────────
-- alice still has reminder enabled with matching time from T5 setup
INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
VALUES (
  '11111111-9002-4000-8000-000000000020',
  '11111111-9002-4000-8000-000000000001',
  '11111111-9002-4000-8000-000000000010',
  (SELECT id FROM public.categories
   WHERE user_id = '11111111-9002-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  1000,
  (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,
  'expense',
  false
);

SELECT public.rpc_send_logging_reminders();

SELECT is(
  (SELECT count(*)::bigint FROM public.notifications
   WHERE user_id = '11111111-9002-4000-8000-000000000001'
     AND type = 'logging_reminder'),
  0::bigint,
  'T6: already logged today — RPC skips, 0 notifications inserted'
);

-- Clean up T6 transaction
DELETE FROM public.transactions WHERE id = '11111111-9002-4000-8000-000000000020';

-- ──────────────────────────────────────────────────────────────────────────────
-- T7: fires when all conditions met (enabled, time matches, no prior notif, no txn today)
-- ──────────────────────────────────────────────────────────────────────────────
-- alice: reminder enabled, time matches current UTC minute, no notification, no txn today
SELECT public.rpc_send_logging_reminders();

SELECT is(
  (SELECT count(*)::bigint FROM public.notifications
   WHERE user_id = '11111111-9002-4000-8000-000000000001'
     AND type = 'logging_reminder'),
  1::bigint,
  'T7: reminder fires when conditions met — 1 notification inserted'
);

-- Clean up T7 notification
DELETE FROM public.notifications WHERE user_id = '11111111-9002-4000-8000-000000000001';

-- ──────────────────────────────────────────────────────────────────────────────
-- T8: disabled user (bob) — no notification
-- ──────────────────────────────────────────────────────────────────────────────
-- bob: reminder_enabled = false (default); alice still has reminder enabled
-- Reset alice's reminder to disabled so only bob is relevant here
UPDATE public.profiles SET reminder_enabled = false
  WHERE user_id = '11111111-9002-4000-8000-000000000001';

SELECT public.rpc_send_logging_reminders();

SELECT is(
  (SELECT count(*)::bigint FROM public.notifications
   WHERE user_id = '11111111-9002-4000-8000-000000000002'
     AND type = 'logging_reminder'),
  0::bigint,
  'T8: bob has reminder_enabled=false — 0 notifications inserted'
);

SELECT * FROM finish();
ROLLBACK;
