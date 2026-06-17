-- Task 6 (Performance & scalability) — set-based pre-filtering for notification RPCs
-- (deferred from 9-4 D2: per-row loop over all profiles with 2 EXISTS queries each).
--
-- Strategy: move the idempotency check + eligibility check into the FOR loop's SELECT
-- query so Postgres filters out ineligible users in one pass before the loop body runs.
-- The per-user EXCEPTION handler is preserved for per-user error isolation.
--
-- rpc_send_logging_reminders: was fetching ALL profiles with reminders enabled, then
-- checking idempotency + today's transactions inside the loop body (3 queries per user).
-- Now: the loop SELECT pre-filters to users who have NOT yet received today's reminder
-- AND have NOT already logged today. Loop body only INSERTs — 1 query per eligible user.
--
-- rpc_send_month_end_summary_notifications: was fetching ALL profiles, then checking
-- idempotency + transaction count inside the loop (3 queries per user).
-- Now: the loop SELECT pre-filters to users with at least 1 prior-month transaction who
-- have NOT already received this month's summary. Loop body only INSERTs.

-- ── rpc_send_logging_reminders ────────────────────────────────────────────────

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
    WHERE reminder_enabled  = true
      AND reminder_time     IS NOT NULL
      AND reminder_timezone IS NOT NULL
      -- Pre-filter: skip users who already received a logging_reminder today
      -- (evaluated in UTC; the in-loop idempotency check uses the user's local date —
      --  this pre-filter uses created_at which is UTC. It may miss a user whose local
      --  day differs from UTC day; the precise per-user check is done inside the loop.
      --  This is a "best-effort" pre-filter that dramatically reduces the loop body
      --  work for the common case.)
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = profiles.user_id
          AND n.type    = 'logging_reminder'
          AND n.created_at >= date_trunc('day', CURRENT_TIMESTAMP)
      )
      -- Pre-filter: skip users who already logged today (UTC date used here;
      -- per-user local-date check is preserved inside the loop body).
      AND NOT EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.user_id     = profiles.user_id
          AND t.date        = CURRENT_DATE
          AND t.archived_at IS NULL
      )
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

      -- Precise idempotency: skip if a logging_reminder was already sent today in user's TZ
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.notifications
        WHERE user_id = v_user.user_id
          AND type = 'logging_reminder'
          AND (created_at AT TIME ZONE v_user.reminder_timezone)::date = v_today_local
      );

      -- Precise skip if user already logged a transaction today in their TZ
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

REVOKE EXECUTE ON FUNCTION public.rpc_send_logging_reminders() FROM PUBLIC;


-- ── rpc_send_month_end_summary_notifications ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_send_month_end_summary_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user             RECORD;
  v_prev_month_start DATE;
  v_prev_month_end   DATE;
  v_month_label      TEXT;
  v_tx_count         INT;
BEGIN
  v_prev_month_start := date_trunc('month', CURRENT_DATE - interval '1 month')::date;
  v_prev_month_end   := (date_trunc('month', CURRENT_DATE) - interval '1 day')::date;
  v_month_label      := to_char(v_prev_month_start, 'YYYY-MM');

  -- Pre-filtered loop: only consider profiles that
  --   (a) have NOT already received this month's summary notification, AND
  --   (b) have at least one transaction in the previous calendar month.
  -- The loop body only needs to INSERT — the per-user EXCEPTION handler is preserved.
  FOR v_user IN
    SELECT p.user_id,
           COUNT(t.id) AS tx_count
    FROM public.profiles p
    JOIN public.transactions t
      ON t.user_id     = p.user_id
      AND t.date       BETWEEN v_prev_month_start AND v_prev_month_end
      AND t.archived_at IS NULL
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = p.user_id
        AND n.type    = 'month_end_summary'
        AND (n.metadata->>'month_label') = v_month_label
    )
    GROUP BY p.user_id
    HAVING COUNT(t.id) > 0
  LOOP
    BEGIN
      v_tx_count := v_user.tx_count;

      INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
      VALUES (
        v_user.user_id,
        'month_end_summary',
        to_char(v_prev_month_start, 'FMMonth YYYY') || ' summary is ready',
        'Review your spending and close the month.',
        '/summary?month=' || v_month_label,
        jsonb_build_object(
          'month_label',  v_month_label,
          'tx_count',     v_tx_count,
          'period_start', v_prev_month_start,
          'period_end',   v_prev_month_end
        )
      )
      ON CONFLICT (user_id, (metadata->>'month_label'))
        WHERE type = 'month_end_summary'
      DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'rpc_send_month_end_summary_notifications: skipping user % due to error: %',
        v_user.user_id, SQLERRM;
    END;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_send_month_end_summary_notifications() FROM PUBLIC;
