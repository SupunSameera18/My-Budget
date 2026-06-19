-- Migration 0081: grant service_role the DML it needs for GDPR erasure.
--
-- Root cause: migrations run as `postgres`, whose default privileges on the
-- public schema grant service_role only Dxtm (TRUNCATE, REFERENCES, TRIGGER,
-- MAINTAIN) — NOT the standard Supabase service_role grant of full DML
-- (a/r/w/d). The supabase_admin role's default privileges DO grant all to
-- service_role, but tables created by migrations inherit postgres's defaults
-- instead. Every prior migration granted DML to `authenticated` explicitly
-- (dev-learnings §12) but assumed service_role was covered by default — it is
-- not. As a result the erase-account Edge Function (the only service-role DML
-- path) failed on its first query with: "permission denied for table
-- family_members" (SQLSTATE 42501).
--
-- Fix: explicitly grant service_role the DML it uses on every table the
-- erasure function touches. service_role is server-only (key never reaches the
-- client) and bypasses RLS by design, so full DML here matches Supabase's
-- intended posture. erasure_audit already has INSERT/SELECT (migration 0032).

GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_members     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_units       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts           TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals              TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goal_contributions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.macros             TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles           TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_trail     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_splits TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invite_codes       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO service_role;
