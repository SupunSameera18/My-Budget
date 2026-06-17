-- Story 9.2: reminder columns on profiles + rpc_send_logging_reminders pg_cron job

-- Add reminder columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reminder_enabled  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_time     TEXT,       -- 'HH:MM' 24-hour local time, e.g. '20:30'
  ADD COLUMN IF NOT EXISTS reminder_timezone TEXT;       -- IANA timezone, e.g. 'Asia/Colombo'

-- SECURITY DEFINER RPC: called by pg_cron every minute
-- Sends a logging_reminder notification to users whose reminder time matches now (in their TZ)
-- and who have NOT yet logged a transaction today (in their TZ).
CREATE OR REPLACE FUNCTION public.rpc_send_logging_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user         RECORD;
  v_local_now    TIMESTAMPTZ;
  v_local_time   TIME;
  v_reminder_hr  INT;
  v_reminder_min INT;
  v_today_local  DATE;
BEGIN
  FOR v_user IN
    SELECT user_id, reminder_time, reminder_timezone
    FROM public.profiles
    WHERE reminder_enabled = true
      AND reminder_time IS NOT NULL
      AND reminder_timezone IS NOT NULL
  LOOP
    BEGIN
      -- Compute current moment in user's local timezone
      v_local_now  := CURRENT_TIMESTAMP AT TIME ZONE v_user.reminder_timezone;
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

-- pg_cron: run every minute (idempotent: unschedule before scheduling)
-- Note: no GRANT EXECUTE to authenticated — function is called only by pg_cron (runs as postgres).
-- Granting to authenticated would allow any logged-in user to trigger mass notifications for all users.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'send-logging-reminders';
SELECT cron.schedule(
  'send-logging-reminders',
  '* * * * *',
  $$SELECT public.rpc_send_logging_reminders()$$
);

-- Down-migration convention (AR-7 / Task 8): to remove this job, run
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'send-logging-reminders';
-- To remove the function:
--   DROP FUNCTION IF EXISTS public.rpc_send_logging_reminders();
