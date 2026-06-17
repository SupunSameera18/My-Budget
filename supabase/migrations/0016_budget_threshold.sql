-- Story 4.2: budget_threshold_events table, rpc_check_budget_thresholds(), and pg_cron schedule

-- Enable pg_cron (pre-installed in Supabase; IF NOT EXISTS prevents error on re-run)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- budget_threshold_events: event store for E9 Notifications
CREATE TABLE public.budget_threshold_events (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id     uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  pct_used      numeric(8,2) NOT NULL,
  actual_minor  bigint NOT NULL,
  fired_at      timestamptz DEFAULT now() NOT NULL,
  processed_at  timestamptz,
  UNIQUE (budget_id, period_start, period_end)
);

CREATE INDEX idx_budget_threshold_events_user_id ON public.budget_threshold_events (user_id);

-- RLS: owner SELECT only; server function handles INSERT via SECURITY DEFINER
ALTER TABLE public.budget_threshold_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY bte_select_owner ON public.budget_threshold_events
  FOR SELECT USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.budget_threshold_events FROM anon, authenticated;

-- rpc_check_budget_thresholds: called by pg_cron, sweeps all active budgets across all users
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
      -- Compute period boundaries for this budget
      CASE v_budget.period_type
        WHEN 'monthly' THEN
          v_period_start := date_trunc('month', CURRENT_DATE)::date;
          v_period_end   := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date;
        WHEN 'weekly' THEN
          -- ISO week: Monday = day 1 (isodow=1), Sunday = day 7 (isodow=7)
          v_period_start := (CURRENT_DATE - (extract(isodow from CURRENT_DATE)::int - 1))::date;
          v_period_end   := (v_period_start + 6)::date;
        WHEN 'yearly' THEN
          v_period_start := date_trunc('year', CURRENT_DATE)::date;
          v_period_end   := (date_trunc('year', CURRENT_DATE) + interval '1 year - 1 day')::date;
        WHEN 'custom' THEN
          IF v_budget.period_start IS NULL OR v_budget.period_end IS NULL THEN
            CONTINUE;
          END IF;
          v_period_start := v_budget.period_start;
          v_period_end   := v_budget.period_end;
        ELSE CONTINUE;
      END CASE;

      -- Skip budgets where today is outside the computed period
      IF CURRENT_DATE < v_period_start OR CURRENT_DATE > v_period_end THEN
        CONTINUE;
      END IF;

      -- Guard against division-by-zero (CHECK constraint prevents this at write-time; defense-in-depth)
      IF v_budget.limit_minor <= 0 THEN
        CONTINUE;
      END IF;

      -- Compute actual spend for this period (expense transactions in budget's categories)
      SELECT COALESCE(SUM(t.amount_minor), 0)
      INTO v_actual_minor
      FROM public.transactions t
      JOIN public.budget_categories bc
        ON bc.category_id = t.category_id
        AND bc.budget_id = v_budget.id
      WHERE t.user_id    = v_budget.user_id
        AND t.type       = 'expense'
        AND t.archived_at IS NULL
        AND t.date BETWEEN v_period_start AND v_period_end;

      -- Fire threshold event at 80%+ (ON CONFLICT ensures once-per-period)
      IF v_actual_minor::numeric / v_budget.limit_minor::numeric >= 0.80 THEN
        v_pct_used := (v_actual_minor::numeric / v_budget.limit_minor::numeric) * 100;
        INSERT INTO public.budget_threshold_events
          (budget_id, user_id, period_start, period_end, pct_used, actual_minor)
        VALUES
          (v_budget.id, v_budget.user_id, v_period_start, v_period_end, v_pct_used, v_actual_minor)
        ON CONFLICT (budget_id, period_start, period_end) DO NOTHING;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'rpc_check_budget_thresholds: skipping budget % due to error: %', v_budget.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- pg_cron: idempotent schedule (unschedule existing job first to prevent duplicates on migration re-run)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'check-budget-thresholds';
SELECT cron.schedule(
  'check-budget-thresholds',
  '0 * * * *',
  $$SELECT public.rpc_check_budget_thresholds()$$
);

-- Down-migration convention (AR-7 / Task 8): to remove this job, run
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'check-budget-thresholds';
-- To remove the function:
--   DROP FUNCTION IF EXISTS public.rpc_check_budget_thresholds();
