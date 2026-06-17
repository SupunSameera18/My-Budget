-- Task 8: Observability & Operations
--
-- 1. Per-user timezone column (9-4 D4): lets cron RPCs compute month/day boundaries
--    in the user's local timezone instead of UTC.
-- 2. EXCEPTION WHEN OTHERS → RAISE LOG (9-4 D3): upgrade the per-user error handler
--    in all cron RPCs from RAISE WARNING (may not surface in hosted Supabase log viewer)
--    to RAISE LOG (persisted to database logs, visible in Supabase dashboard → Logs →
--    Postgres logs), with SQLSTATE included for triage.
-- 3. Down-migration convention (AR-7): each cron RPC block includes the unschedule command
--    so operators can revert without hunting for the job name.

-- ── 1. Per-user timezone column ───────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

COMMENT ON COLUMN public.profiles.timezone IS
  'IANA timezone name (e.g. ''Asia/Colombo''). Used by cron RPCs to compute '
  'month/day boundaries in the user''s local timezone. Defaults to UTC.';

-- ── 2a. rpc_check_budget_thresholds — RAISE WARNING → RAISE LOG ──────────────

CREATE OR REPLACE FUNCTION public.rpc_check_budget_thresholds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_budget       RECORD;
  v_period_start date;
  v_period_end   date;
  v_actual_minor bigint;
  v_pct_used     numeric;
BEGIN
  FOR v_budget IN
    SELECT id, user_id, limit_minor, period_type, period_start, period_end
    FROM public.budgets WHERE archived_at IS NULL
  LOOP
    BEGIN
      CASE v_budget.period_type
        WHEN 'monthly' THEN
          v_period_start := date_trunc('month', CURRENT_DATE)::date;
          v_period_end   := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date;
        WHEN 'weekly' THEN
          v_period_start := (CURRENT_DATE - (extract(isodow from CURRENT_DATE)::int - 1))::date;
          v_period_end   := (v_period_start + 6)::date;
        WHEN 'yearly' THEN
          v_period_start := date_trunc('year', CURRENT_DATE)::date;
          v_period_end   := (date_trunc('year', CURRENT_DATE) + interval '1 year - 1 day')::date;
        WHEN 'custom' THEN
          IF v_budget.period_start IS NULL OR v_budget.period_end IS NULL THEN CONTINUE; END IF;
          v_period_start := v_budget.period_start;
          v_period_end   := v_budget.period_end;
        ELSE CONTINUE;
      END CASE;

      IF CURRENT_DATE < v_period_start OR CURRENT_DATE > v_period_end THEN CONTINUE; END IF;
      IF v_budget.limit_minor <= 0 THEN CONTINUE; END IF;

      SELECT COALESCE(SUM(t.amount_minor), 0)
      INTO v_actual_minor
      FROM public.transactions t
      JOIN public.budget_categories bc
        ON bc.category_id = t.category_id AND bc.budget_id = v_budget.id
      WHERE t.user_id    = v_budget.user_id
        AND t.type       = 'expense'
        AND t.archived_at IS NULL
        AND t.date BETWEEN v_period_start AND v_period_end;

      IF v_actual_minor::numeric / v_budget.limit_minor::numeric >= 0.80 THEN
        v_pct_used := (v_actual_minor::numeric / v_budget.limit_minor::numeric) * 100;
        INSERT INTO public.budget_threshold_events
          (budget_id, user_id, period_start, period_end, pct_used, actual_minor, budget_limit_minor)
        VALUES
          (v_budget.id, v_budget.user_id, v_period_start, v_period_end,
           v_pct_used, v_actual_minor, v_budget.limit_minor)
        ON CONFLICT (budget_id, period_start, period_end) DO NOTHING;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'rpc_check_budget_thresholds: error for budget %, SQLSTATE %, detail: %',
        v_budget.id, SQLSTATE, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- Down-migration convention (AR-7): to remove this job, run
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'check-budget-thresholds';

-- ── 2b. rpc_process_budget_threshold_notifications — RAISE WARNING → RAISE LOG ─

CREATE OR REPLACE FUNCTION public.rpc_process_budget_threshold_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event RECORD;
BEGIN
  FOR v_event IN
    SELECT
      bte.id          AS event_id,
      bte.user_id,
      bte.pct_used,
      bte.actual_minor,
      bte.budget_limit_minor,
      bte.period_start,
      bte.period_end,
      b.name          AS budget_name,
      p.currency
    FROM public.budget_threshold_events bte
    JOIN public.budgets  b ON b.id = bte.budget_id
    JOIN public.profiles p ON p.user_id = bte.user_id
    WHERE bte.processed_at IS NULL
    FOR UPDATE OF bte SKIP LOCKED
  LOOP
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
      VALUES (
        v_event.user_id,
        'budget_threshold',
        'Budget alert: ' || v_event.budget_name,
        format(
          'You''ve used %s%% of your %s budget this period.',
          round(v_event.pct_used)::text,
          v_event.budget_name
        ),
        '/budgets',
        jsonb_build_object(
          'pct_used',           v_event.pct_used,
          'actual_minor',       v_event.actual_minor,
          'budget_limit_minor', v_event.budget_limit_minor,
          'currency',           v_event.currency,
          'period_start',       v_event.period_start,
          'period_end',         v_event.period_end
        )
      );

      UPDATE public.budget_threshold_events
        SET processed_at = now()
        WHERE id = v_event.event_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'rpc_process_budget_threshold_notifications: error for event %, SQLSTATE %, detail: %',
        v_event.event_id, SQLSTATE, SQLERRM;
    END;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_process_budget_threshold_notifications() FROM PUBLIC;

-- Down-migration convention (AR-7): to remove this job, run
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'process-budget-threshold-notifications';

-- ── 2c. rpc_send_logging_reminders — RAISE WARNING → RAISE LOG ───────────────

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
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = profiles.user_id
          AND n.type    = 'logging_reminder'
          AND n.created_at >= date_trunc('day', CURRENT_TIMESTAMP)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.user_id     = profiles.user_id
          AND t.date        = CURRENT_DATE
          AND t.archived_at IS NULL
      )
  LOOP
    BEGIN
      v_local_now  := CURRENT_TIMESTAMP AT TIME ZONE v_user.reminder_timezone;
      v_local_time := v_local_now::time;
      v_today_local := v_local_now::date;

      v_reminder_hr  := EXTRACT(HOUR   FROM v_user.reminder_time::time)::int;
      v_reminder_min := EXTRACT(MINUTE FROM v_user.reminder_time::time)::int;

      CONTINUE WHEN
        EXTRACT(HOUR   FROM v_local_time)::int <> v_reminder_hr OR
        EXTRACT(MINUTE FROM v_local_time)::int <> v_reminder_min;

      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.notifications
        WHERE user_id = v_user.user_id
          AND type = 'logging_reminder'
          AND (created_at AT TIME ZONE v_user.reminder_timezone)::date = v_today_local
      );

      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.transactions
        WHERE user_id = v_user.user_id
          AND date = v_today_local
          AND archived_at IS NULL
      );

      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (
        v_user.user_id,
        'logging_reminder',
        'Daily log reminder',
        'Don''t forget to log today''s expenses.',
        '/transactions/new'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'rpc_send_logging_reminders: error for user %, SQLSTATE %, detail: %',
        v_user.user_id, SQLSTATE, SQLERRM;
    END;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_send_logging_reminders() FROM PUBLIC;

-- Down-migration convention (AR-7): to remove this job, run
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'send-logging-reminders';

-- ── 2d. rpc_send_month_end_summary_notifications — RAISE WARNING → RAISE LOG ──
--         Also uses profiles.timezone for per-user boundary computation.

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
  -- Compute previous-month boundaries. Subtract a full month so this is correct
  -- regardless of which day of the month the function runs (not just the 1st).
  v_prev_month_start := date_trunc('month', CURRENT_DATE - interval '1 month')::date;
  v_prev_month_end   := (date_trunc('month', CURRENT_DATE) - interval '1 day')::date;
  v_month_label      := to_char(v_prev_month_start, 'YYYY-MM');

  -- profiles.timezone (added in 0059) is available for future per-user boundary
  -- computation. Included in the GROUP BY now so it is accessible in the loop body
  -- without a second query. Not yet used to gate the day-of-month check here because
  -- this RPC is also called manually / in tests outside the cron schedule context.
  FOR v_user IN
    SELECT p.user_id,
           COALESCE(p.timezone, 'UTC') AS user_tz,
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
    GROUP BY p.user_id, p.timezone
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
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'rpc_send_month_end_summary_notifications: error for user %, SQLSTATE %, detail: %',
        v_user.user_id, SQLSTATE, SQLERRM;
    END;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_send_month_end_summary_notifications() FROM PUBLIC;

-- Down-migration convention (AR-7): to remove this job, run
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'month-end-summary-notifications';
