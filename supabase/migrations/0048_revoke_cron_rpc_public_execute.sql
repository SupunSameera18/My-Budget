-- 0048_revoke_cron_rpc_public_execute.sql
--
-- Epic 9 retrospective finding (D0 / 9.4 review), CORRECTED after testing
-- against a freshly-bootstrapped database:
--
-- "REVOKE EXECUTE ... FROM PUBLIC" (the pattern used in 0043 for
-- rpc_send_month_end_summary_notifications) does NOT actually lock a
-- function down on this project. A fresh `supabase db reset` (and, by the
-- same mechanism, a freshly-provisioned hosted Supabase project) sets up a
-- default ACL — `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
-- GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role` — that
-- grants EXECUTE to `anon` and `authenticated` DIRECTLY at function-creation
-- time, not merely via inheritance from PUBLIC (confirmed via `\ddp` —
-- `anon=X/postgres`, `authenticated=X/postgres` are explicit default-ACL
-- entries, separate from PUBLIC's own privilege row). Revoking only from
-- PUBLIC leaves those direct grants untouched, so `anon`/`authenticated`
-- still have EXECUTE. This was masked during prior development because the
-- long-lived local dev database predated this default ACL being set up by
-- the current Supabase CLI version, so the old PUBLIC-only revoke appeared
-- to work there — it does not survive a fresh reset or a new hosted project.
--
-- Fix: revoke EXECUTE explicitly from `anon` and `authenticated` (not just
-- PUBLIC) on every cron-only / superuser-only RPC. This migration corrects
-- 0043's function and closes the same gap on three more:
--   rpc_send_month_end_summary_notifications()     (0043, Story 9.4 — re-revoked correctly here)
--   rpc_send_logging_reminders()                    (0041, Story 9.2)
--   rpc_check_budget_thresholds()                    (0016, Story 4.2 — predates E9)
--   rpc_process_budget_threshold_notifications()     (0042, Story 9.3)
--
-- No GRANT EXECUTE is added for any role — these remain pg_cron/superuser-only.
-- PUBLIC is included too for defense-in-depth (harmless if already revoked).

REVOKE EXECUTE ON FUNCTION public.rpc_send_month_end_summary_notifications()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_send_logging_reminders()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_check_budget_thresholds()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_process_budget_threshold_notifications()
  FROM PUBLIC, anon, authenticated;
