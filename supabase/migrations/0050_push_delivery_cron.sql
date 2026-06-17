-- 0050_push_delivery_cron.sql
-- Phase 2 Task 2a: schedule the push-delivery Edge Function (FR-43).
--
-- Story 9.6 shipped send-push-notification (the Edge Function that finds
-- `notifications` rows with push_notified_at IS NULL and delivers Web Push),
-- but nothing ever invoked it on a schedule — so logging-reminder (FR-39),
-- budget-threshold (FR-40), and month-end (FR-41) notifications create inbox
-- rows that never push, even though the inbox row exists. This migration
-- closes that gap with a pg_cron job that calls the function every 5 minutes
-- via pg_net (async HTTP), the same mechanism already wired up in 0045.
--
-- Secrets: the function URL and service-role key are project-specific and
-- must never be committed to a migration file. They are read from Supabase
-- Vault (`supabase_vault` extension, already enabled on every Supabase
-- project) via two named secrets that must be created ONCE per environment
-- through the SQL editor (or `supabase secrets`/vault API) before this job
-- can succeed — see README "Push delivery cron setup" / dev-learnings §43:
--
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-push-notification', 'push_delivery_function_url');
--   select vault.create_secret('<service-role-key>', 'push_delivery_service_role_key');
--
-- Until those secrets exist, the job's HTTP call resolves the URL/key to NULL
-- and pg_net will simply fail that request (logged in net._http_response,
-- visible via `select * from net._http_response order by created desc`) —
-- it does NOT error out the cron job itself, so this migration is safe to
-- apply before secrets are configured (matches the project's existing
-- "deferred to hosted Supabase" pattern — see deferred-work.md).

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'deliver-push-notifications';

SELECT cron.schedule(
  'deliver-push-notifications',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_delivery_function_url'),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_delivery_service_role_key')
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Down-migration convention (Task 8 / AR-7): to remove this job, run
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'deliver-push-notifications';
