-- 0084_recurring_goals.sql
-- Recurring goals: a goal can repeat weekly or monthly. At each period boundary
-- the current instance is archived and a brand-new instance (0 progress, same
-- target) is auto-created for the new period. Past instances + their
-- contributions are preserved as history (archived_at IS NOT NULL).
--
-- Reset is driven by a daily pg_cron job (mirrors 0050_push_delivery_cron.sql)
-- AND lazily by getGoals() so a reset is visible the moment the user opens the
-- app, even before cron fires.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Schema: recurrence metadata on goals
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS recurrence   TEXT NOT NULL DEFAULT 'none'
    CHECK (recurrence IN ('none', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end   DATE,
  ADD COLUMN IF NOT EXISTS series_id    UUID;

-- Find recurring instances due for a roll without scanning all goals.
CREATE INDEX IF NOT EXISTS idx_goals_recurring_active
  ON public.goals (period_end)
  WHERE archived_at IS NULL AND recurrence <> 'none';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Helper: compute the inclusive period end for a start date + recurrence
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.goal_period_end(
  p_start      DATE,
  p_recurrence TEXT
) RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_recurrence
    WHEN 'weekly'  THEN p_start + 6
    WHEN 'monthly' THEN (p_start + INTERVAL '1 month' - INTERVAL '1 day')::date
    ELSE NULL
  END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. rpc_create_goal: add p_recurrence (DEFAULT 'none', backward-compatible)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.rpc_create_goal(text, bigint, boolean);

CREATE FUNCTION public.rpc_create_goal(
  p_name         TEXT,
  p_target_minor BIGINT,
  p_is_shared    BOOLEAN DEFAULT false,
  p_recurrence   TEXT DEFAULT 'none'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_goal_id      uuid;
  v_period_start date;
  v_period_end   date;
  v_series_id    uuid;
BEGIN
  IF p_recurrence NOT IN ('none', 'weekly', 'monthly') THEN
    RAISE EXCEPTION 'Invalid recurrence: %', p_recurrence;
  END IF;

  IF p_recurrence <> 'none' THEN
    v_period_start := CURRENT_DATE;
    v_period_end   := public.goal_period_end(v_period_start, p_recurrence);
    v_series_id    := gen_random_uuid();
  END IF;

  INSERT INTO public.goals (
    user_id, name, target_minor, is_shared,
    recurrence, period_start, period_end, series_id
  )
  VALUES (
    v_user_id, p_name, p_target_minor, p_is_shared,
    p_recurrence, v_period_start, v_period_end, v_series_id
  )
  RETURNING id INTO v_goal_id;

  RETURN v_goal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_create_goal(text, bigint, boolean, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. rpc_roll_recurring_goals: archive elapsed recurring instances and spawn a
--    fresh one for the current period.
--
--    Security: SECURITY DEFINER so it can write goals bypassing RLS, but it
--    self-scopes by auth.uid():
--      • authenticated caller (getGoals) → rolls ONLY their own goals
--      • cron / service context (auth.uid() IS NULL) → rolls ALL users' goals
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_roll_recurring_goals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller   uuid := auth.uid();
  g          RECORD;
  v_start    date;
  v_end      date;
  v_rolled   integer := 0;
BEGIN
  FOR g IN
    SELECT *
    FROM public.goals
    WHERE archived_at IS NULL
      AND recurrence <> 'none'
      AND period_end IS NOT NULL
      AND period_end < CURRENT_DATE
      AND (v_caller IS NULL OR user_id = v_caller)
  LOOP
    -- Advance to the period that contains today (skips any fully-missed periods).
    v_start := g.period_end + 1;
    v_end   := public.goal_period_end(v_start, g.recurrence);
    WHILE v_end < CURRENT_DATE LOOP
      v_start := v_end + 1;
      v_end   := public.goal_period_end(v_start, g.recurrence);
    END LOOP;

    -- Archive the elapsed instance (its contributions stay as history).
    UPDATE public.goals
      SET archived_at = now(), updated_at = now()
      WHERE id = g.id;

    -- Spawn a fresh instance for the current period (0 progress).
    INSERT INTO public.goals (
      user_id, name, target_minor, is_shared,
      recurrence, period_start, period_end, series_id
    )
    VALUES (
      g.user_id, g.name, g.target_minor, g.is_shared,
      g.recurrence, v_start, v_end, COALESCE(g.series_id, gen_random_uuid())
    );

    v_rolled := v_rolled + 1;
  END LOOP;

  RETURN v_rolled;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_roll_recurring_goals() FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_roll_recurring_goals() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Daily cron: roll every user's recurring goals just after midnight.
--    (auth.uid() is NULL in the cron context → rolls all users.)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'roll-recurring-goals';

SELECT cron.schedule(
  'roll-recurring-goals',
  '5 0 * * *',
  $$ SELECT public.rpc_roll_recurring_goals(); $$
);

-- Down-migration convention (AR-7): to remove this job, run
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'roll-recurring-goals';
