-- Migration 0060: add optional p_now parameter to rpc_send_logging_reminders
-- Allows tests to pass a fixed reference timestamp, eliminating minute-boundary
-- flakiness in T5/T6/T7 of rpc_send_logging_reminders.test.sql.
-- The cron caller still invokes rpc_send_logging_reminders() with no arguments
-- (p_now defaults to CURRENT_TIMESTAMP), so this is fully backward-compatible.
-- Down-migration: DROP FUNCTION public.rpc_send_logging_reminders(timestamptz);
--                 then recreate the original 0-param form from migration 0041.

DROP FUNCTION IF EXISTS public.rpc_send_logging_reminders();

CREATE OR REPLACE FUNCTION public.rpc_send_logging_reminders(
  p_now TIMESTAMPTZ DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reference    TIMESTAMPTZ;
  v_user         RECORD;
  v_local_now    TIMESTAMPTZ;
  v_local_time   TIME;
  v_reminder_hr  INT;
  v_reminder_min INT;
  v_today_local  DATE;
BEGIN
  v_reference := COALESCE(p_now, CURRENT_TIMESTAMP);

  FOR v_user IN
    SELECT user_id, reminder_time, reminder_timezone
    FROM public.profiles
    WHERE reminder_enabled = true
      AND reminder_time IS NOT NULL
      AND reminder_timezone IS NOT NULL
  LOOP
    BEGIN
      -- Compute current moment in user's local timezone
      v_local_now  := v_reference AT TIME ZONE v_user.reminder_timezone;
      v_local_time := v_local_now::time;
      v_today_local := v_local_now::date;

      -- Parse 'HH:MM' string to hours/minutes
      v_reminder_hr  := EXTRACT(HOUR   FROM v_user.reminder_time::time)::int;
      v_reminder_min := EXTRACT(MINUTE FROM v_user.reminder_time::time)::int;

      -- Only fire when the current local minute matches the configured time
      CONTINUE WHEN
        EXTRACT(HOUR   FROM v_local_time)::int <> v_reminder_hr OR
        EXTRACT(MINUTE FROM v_local_time)::int <> v_reminder_min;

      -- Idempotency: skip if a logging_reminder was already sent today (in user's TZ)
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.notifications
        WHERE user_id = v_user.user_id
          AND type = 'logging_reminder'
          AND (created_at AT TIME ZONE v_user.reminder_timezone)::date = v_today_local
      );

      -- Skip if user already logged a transaction today (in their TZ)
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.transactions
        WHERE user_id = v_user.user_id
          AND date = v_today_local
          AND archived_at IS NULL
      );

      -- Fire the reminder notification
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (
        v_user.user_id,
        'logging_reminder',
        'Daily log reminder',
        'Don''t forget to log today''s expenses.',
        '/transactions/new'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'rpc_send_logging_reminders: skipping user % due to error: %',
        v_user.user_id, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- Re-apply REVOKE so the new signature also has no public execute
REVOKE EXECUTE ON FUNCTION public.rpc_send_logging_reminders(timestamptz) FROM PUBLIC, anon, authenticated;
