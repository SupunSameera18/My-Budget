-- cron_jobs.test.sql
-- Task 8 (Phase 2 Observability & Ops): verify each expected pg_cron job exists with
-- the correct schedule string. This is the pgTAP/migration guard requested in the
-- E4 retro item: "pgTAP check that each cron.job exists with the expected schedule."
--
-- Each assertion fails loudly if the job is missing or the schedule was changed without
-- updating both the migration AND this test — acting as a pinned contract for the cron
-- configuration.
--
-- IMPORTANT: pg_cron runs as the postgres role, and cron.job is in the cron schema.
-- This test must run as postgres (which npx supabase test db does) to read cron.job.

BEGIN;
SELECT plan(5);

-- T1: budget threshold check (0016, updated in 0042, 0059)
SELECT is(
  (SELECT schedule FROM cron.job WHERE jobname = 'check-budget-thresholds'),
  '0 * * * *',
  'T1: check-budget-thresholds has correct hourly schedule'
);

-- T2: logging reminder (0041, updated in 0058, 0059)
SELECT is(
  (SELECT schedule FROM cron.job WHERE jobname = 'send-logging-reminders'),
  '* * * * *',
  'T2: send-logging-reminders has correct every-minute schedule'
);

-- T3: budget threshold notification processing (0042, updated in 0059)
SELECT is(
  (SELECT schedule FROM cron.job WHERE jobname = 'process-budget-threshold-notifications'),
  '1 * * * *',
  'T3: process-budget-threshold-notifications has correct schedule (1 min past hour)'
);

-- T4: month-end summary (0043, updated in 0059)
SELECT is(
  (SELECT schedule FROM cron.job WHERE jobname = 'month-end-summary-notifications'),
  '5 0 1 * *',
  'T4: month-end-summary-notifications has correct schedule (00:05 on 1st of month)'
);

-- T5: push delivery (0050)
SELECT is(
  (SELECT schedule FROM cron.job WHERE jobname = 'deliver-push-notifications'),
  '*/5 * * * *',
  'T5: deliver-push-notifications has correct every-5-minute schedule'
);

SELECT * FROM finish();
ROLLBACK;
