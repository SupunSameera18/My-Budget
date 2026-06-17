-- Story 9.4: month-end summary ready — rpc_send_month_end_summary_notifications + pg_cron
--
-- For each profile with at least one transaction in the previous calendar month:
--   INSERT a 'month_end_summary' notification (idempotent — once per user per month).
-- Users with zero previous-month transactions are skipped (nothing to review).
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
  v_month_label      TEXT;     -- 'YYYY-MM' of previous month
  v_tx_count         INT;
BEGIN
  -- Compute previous calendar month boundaries.
  -- NOTE: must subtract a full month (not 1 day) — the function is SECURITY DEFINER and
  -- can be invoked manually/in tests on any day of the month, not just the 1st (when
  -- pg_cron fires it). `date_trunc('month', CURRENT_DATE - interval '1 day')` only resolves
  -- to the previous month when CURRENT_DATE is the 1st; on any other day it resolves to the
  -- CURRENT month. Subtracting a full month is correct regardless of the day of month.
  v_prev_month_start := date_trunc('month', CURRENT_DATE - interval '1 month')::date;
  v_prev_month_end   := (date_trunc('month', CURRENT_DATE) - interval '1 day')::date;
  v_month_label      := to_char(v_prev_month_start, 'YYYY-MM');

  FOR v_user IN
    SELECT user_id FROM public.profiles
  LOOP
    BEGIN
      -- Idempotency: skip if already sent this month's summary for this user
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.notifications
        WHERE user_id = v_user.user_id
          AND type = 'month_end_summary'
          AND (metadata->>'month_label') = v_month_label
      );

      -- Only notify users who had at least one transaction in the previous month
      SELECT COUNT(*)
      INTO v_tx_count
      FROM public.transactions
      WHERE user_id    = v_user.user_id
        AND date BETWEEN v_prev_month_start AND v_prev_month_end
        AND archived_at IS NULL;

      CONTINUE WHEN v_tx_count = 0;

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
      RAISE WARNING 'rpc_send_month_end_summary_notifications: skipping user % due to error: %',
        v_user.user_id, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- Note: no GRANT EXECUTE to authenticated — function is called only by pg_cron (runs as postgres).
-- Granting to authenticated would let any logged-in user trigger mass notifications for all users
-- (same rule applied in 0041/0042 review patches — §9 enforced check).
-- REVOKE EXECUTE FROM PUBLIC is required here: PostgreSQL grants EXECUTE on newly created
-- functions to PUBLIC by default, so simply omitting the GRANT does not actually lock this
-- down — without this REVOKE, any role inheriting from PUBLIC (e.g. authenticated, anon) could
-- still call this SECURITY DEFINER function and mass-notify every profile in the system.
REVOKE EXECUTE ON FUNCTION public.rpc_send_month_end_summary_notifications() FROM PUBLIC;

-- pg_cron: fire at 00:05 UTC on the 1st of every month (idempotent: unschedule before scheduling)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'month-end-summary-notifications';
SELECT cron.schedule(
  'month-end-summary-notifications',
  '5 0 1 * *',
  $$SELECT public.rpc_send_month_end_summary_notifications()$$
);

-- Down-migration convention (AR-7 / Task 8): to remove this job, run
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'month-end-summary-notifications';
-- To remove the function:
--   DROP FUNCTION IF EXISTS public.rpc_send_month_end_summary_notifications();
