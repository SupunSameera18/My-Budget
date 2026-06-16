-- Story 9.3: extend budget_threshold_events + processing RPC for in-app notifications

-- 1. Add budget_limit_minor so notifications can say "spent X of Y"
--    NOT NULL DEFAULT 0: old unprocessed rows remain valid; new events carry the correct value.
ALTER TABLE public.budget_threshold_events
  ADD COLUMN IF NOT EXISTS budget_limit_minor BIGINT NOT NULL DEFAULT 0;

-- 2. Partial index for efficient unprocessed-event scan (deferred from Epic 4, Story 4.2)
CREATE INDEX IF NOT EXISTS idx_bte_unprocessed
  ON public.budget_threshold_events (user_id)
  WHERE processed_at IS NULL;

-- 3. Update rpc_check_budget_thresholds to populate budget_limit_minor on new events.
--    No signature change (same RETURNS void, no params) — CREATE OR REPLACE is safe.
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
      RAISE WARNING 'rpc_check_budget_thresholds: skipping budget % due to error: %',
        v_budget.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- 4. Processing RPC: converts unprocessed threshold events to in-app notifications.
--    SECURITY DEFINER: reads all users' budgets and profiles (cross-user SELECT).
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
      RAISE WARNING 'rpc_process_budget_threshold_notifications: skipping event % due to error: %',
        v_event.event_id, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- Note: no GRANT EXECUTE to authenticated — function is called only by pg_cron (runs as postgres).

-- 5. pg_cron: process notifications 1 minute after the threshold check (idempotent unschedule first)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'process-budget-threshold-notifications';
SELECT cron.schedule(
  'process-budget-threshold-notifications',
  '1 * * * *',
  $$SELECT public.rpc_process_budget_threshold_notifications()$$
);
