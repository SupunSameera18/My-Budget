-- Story 6.1: rpc_get_health_score — server-authoritative Financial Health Score
-- Also adds missing table grants for budgets/budget_categories/goals/goal_contributions
-- that were omitted from migrations 0015 and 0017. Required for SECURITY INVOKER function
-- and for RLS pgTAP tests that SET LOCAL role TO authenticated.

-- Missing grants from migration 0015 (budgets)
GRANT SELECT, INSERT, UPDATE ON public.budgets TO authenticated;
GRANT SELECT, INSERT ON public.budget_categories TO authenticated;

-- Missing grants from migration 0016 (budget_threshold)
GRANT SELECT ON public.budget_threshold_events TO authenticated;

-- Missing grants from migration 0017 (goals)
-- goal_contributions is append-only (no UPDATE per migration 0017 REVOKE)
GRANT SELECT, INSERT, UPDATE ON public.goals TO authenticated;
GRANT SELECT, INSERT ON public.goal_contributions TO authenticated;


-- Formula mirrors src/lib/money/health-score.ts exactly.
-- Weights: budget=0.40, cushion=0.30, savings=0.20, goal=0.10
-- N/A re-normalization: null components excluded; totalWeight re-normalized.
-- SECURITY INVOKER: each caller only sees their own data via auth.uid().

CREATE OR REPLACE FUNCTION public.rpc_get_health_score(
  p_period_start DATE,
  p_period_end   DATE
) RETURNS TABLE(score INT, confidence_percent INT, has_enough_data BOOLEAN)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id              UUID := auth.uid();
  v_tx_count             INT := 0;
  v_income_minor         BIGINT := 0;
  v_expense_minor        BIGINT := 0;
  v_cushion_rate         NUMERIC;
  v_savings_rate         NUMERIC;
  v_budget_adherence_rate NUMERIC;
  v_goal_progress_rate   NUMERIC;
  v_total_weight         NUMERIC := 0;
  v_weighted_sum         NUMERIC := 0;
  v_final_score          INT := 0;
  v_confidence           INT;
  v_has_enough           BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- 1. Count non-transfer, non-archived transactions in period
  SELECT COUNT(*) INTO v_tx_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND date BETWEEN p_period_start AND p_period_end
    AND type NOT IN ('internal_transfer', 'external_transfer', 'reconciliation')
    AND archived_at IS NULL;

  -- 2. Income and expense totals for period
  SELECT
    COALESCE(SUM(CASE WHEN type = 'income'  THEN amount_minor ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_minor ELSE 0 END), 0)
  INTO v_income_minor, v_expense_minor
  FROM public.transactions
  WHERE user_id = v_user_id
    AND date BETWEEN p_period_start AND p_period_end
    AND archived_at IS NULL;

  -- 3. Cushion + savings rate (both null when no income)
  IF v_income_minor > 0 THEN
    v_cushion_rate := GREATEST(
      LEAST(
        (v_income_minor - v_expense_minor)::NUMERIC / v_income_minor,
        1.0
      ),
      0.0
    );
    v_savings_rate := v_cushion_rate;
  END IF;

  -- 4. Budget adherence: avg(LEAST(actual/limit, 1.0)) across active budgets
  --    Uses budget_categories join to pool all transaction amounts per budget.
  SELECT AVG(
    LEAST(
      COALESCE(actual.actual_minor, 0)::NUMERIC / NULLIF(b.limit_minor, 0),
      1.0
    )
  ) INTO v_budget_adherence_rate
  FROM public.budgets b
  LEFT JOIN (
    SELECT bc.budget_id, SUM(t.amount_minor) AS actual_minor
    FROM public.budget_categories bc
    JOIN public.transactions t ON t.category_id = bc.category_id
    WHERE t.user_id = v_user_id
      AND t.date BETWEEN p_period_start AND p_period_end
      AND t.type = 'expense'
      AND t.archived_at IS NULL
    GROUP BY bc.budget_id
  ) actual ON actual.budget_id = b.id
  WHERE b.user_id = v_user_id
    AND b.archived_at IS NULL;

  -- 5. Goal progress: AVG(SUM(contributions) / target) across active goals.
  --    goals has NO current_amount column — always computed via SUM(contributions).
  SELECT AVG(progress) INTO v_goal_progress_rate
  FROM (
    SELECT LEAST(
      COALESCE(SUM(gc.amount_minor), 0)::NUMERIC / NULLIF(g.target_minor, 0),
      1.0
    ) AS progress
    FROM public.goals g
    LEFT JOIN public.goal_contributions gc ON gc.goal_id = g.id
    WHERE g.user_id = v_user_id
      AND g.archived_at IS NULL
    GROUP BY g.id, g.target_minor
  ) sub;

  -- 6. Sub-scores and N/A re-normalization (mirrors TS function)
  IF v_budget_adherence_rate IS NOT NULL THEN
    v_total_weight := v_total_weight + 0.40;
    v_weighted_sum := v_weighted_sum + 0.40 * LEAST(v_budget_adherence_rate * 100, 100);
  END IF;
  IF v_cushion_rate IS NOT NULL THEN
    v_total_weight := v_total_weight + 0.30;
    v_weighted_sum := v_weighted_sum + 0.30 * LEAST((v_cushion_rate / 0.20) * 100, 100);
  END IF;
  IF v_savings_rate IS NOT NULL THEN
    v_total_weight := v_total_weight + 0.20;
    v_weighted_sum := v_weighted_sum + 0.20 * LEAST((v_savings_rate / 0.20) * 100, 100);
  END IF;
  IF v_goal_progress_rate IS NOT NULL THEN
    v_total_weight := v_total_weight + 0.10;
    v_weighted_sum := v_weighted_sum + 0.10 * LEAST(v_goal_progress_rate * 100, 100);
  END IF;

  -- 7. Compute final score with re-normalization and round-half-up
  IF v_total_weight > 0 THEN
    v_final_score := LEAST(100, GREATEST(0,
      FLOOR((v_weighted_sum / v_total_weight) + 0.5)::INT
    ));
  END IF;

  v_confidence  := FLOOR(LEAST(v_tx_count::NUMERIC / 30, 1) * 74)::INT;
  v_has_enough  := v_tx_count >= 30;

  RETURN QUERY SELECT v_final_score, v_confidence, v_has_enough;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_health_score(date, date) TO authenticated;
