-- 0077_contribution_analysis_settled_at.sql
--
-- Fix: contribution analysis didn't reset after settle up.
--
-- Root cause: rpc_get_contribution_analysis filtered by `t.date >= p_period_start`
-- (DATE precision). After settling at 10am on June 19, p_period_start = '2026-06-19'
-- still included pre-settle June 19 transactions (same calendar day).
--
-- Fix: replace p_period_start DATE with p_settled_at TIMESTAMPTZ and filter by
-- t.created_at > p_settled_at — exact same boundary used by rpc_settle_up (0076).
--
-- The old (DATE, DATE) overload must be dropped first because CREATE OR REPLACE
-- only replaces an exact signature match; adding a parameter creates a new overload.

DROP FUNCTION IF EXISTS public.rpc_get_contribution_analysis(DATE, DATE);

CREATE OR REPLACE FUNCTION public.rpc_get_contribution_analysis(
  p_settled_at   TIMESTAMPTZ DEFAULT NULL,
  p_period_end   DATE        DEFAULT NULL
)
RETURNS TABLE(
  contributor_id          UUID,
  total_paid_minor        BIGINT,
  transaction_count       BIGINT,
  goal_contribution_minor BIGINT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller         UUID := auth.uid();
  v_family_unit_id UUID;
BEGIN
  IF v_caller IS NULL THEN RETURN; END IF;

  SELECT fm.family_unit_id
    INTO v_family_unit_id
    FROM public.family_members fm
   WHERE fm.user_id = v_caller
   LIMIT 1;

  IF v_family_unit_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH members AS (
    SELECT fm.user_id
      FROM public.family_members fm
     WHERE fm.family_unit_id = v_family_unit_id
  ),
  shared_txns AS (
    -- Shared transactions created after the settlement moment (or all time if no settlement).
    -- Uses created_at (TIMESTAMPTZ) — same boundary as rpc_settle_up — so pre-settle
    -- same-day transactions are excluded and the analysis resets cleanly after settle.
    SELECT t.id       AS tx_id,
           t.user_id  AS owner_id,
           t.amount_minor
      FROM public.transactions t
     WHERE t.is_shared = true
       AND t.archived_at IS NULL
       AND (p_settled_at IS NULL OR t.created_at > p_settled_at)
       AND (p_period_end IS NULL  OR t.date      <= p_period_end)
       AND t.user_id IN (SELECT m.user_id FROM members m)
  ),
  per_member AS (
    SELECT
      m.user_id                    AS contrib_id,
      COUNT(*) FILTER (WHERE st.owner_id = m.user_id) AS tx_count,
      COALESCE(SUM(
        COALESCE(
          CASE WHEN ts.payer_id = m.user_id
               THEN ts.payer_share_minor
               ELSE ts.partner_share_minor
          END,
          CASE WHEN st.owner_id = m.user_id
               THEN st.amount_minor
               ELSE 0
          END
        )
      ), 0)                        AS total_paid
    FROM shared_txns st
    CROSS JOIN members m
    LEFT JOIN public.transaction_splits ts ON ts.transaction_id = st.tx_id
    GROUP BY m.user_id
  ),
  goal_agg AS (
    -- Shared goal contributions created after the settlement moment.
    SELECT
      gc.user_id           AS contrib_id,
      SUM(gc.amount_minor) AS goal_total
      FROM public.goal_contributions gc
      JOIN public.goals g ON g.id = gc.goal_id
     WHERE g.is_shared = true
       AND g.archived_at IS NULL
       AND gc.user_id IN (SELECT m.user_id FROM members m)
       AND (p_settled_at IS NULL OR gc.created_at > p_settled_at)
       AND (p_period_end  IS NULL OR gc.date       <= p_period_end)
     GROUP BY gc.user_id
  )
  SELECT
    m.user_id,
    COALESCE(pm.total_paid, 0)::BIGINT,
    COALESCE(pm.tx_count,   0)::BIGINT,
    COALESCE(ga.goal_total, 0)::BIGINT
  FROM members m
  LEFT JOIN per_member pm ON pm.contrib_id = m.user_id
  LEFT JOIN goal_agg   ga ON ga.contrib_id = m.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_contribution_analysis(TIMESTAMPTZ, DATE) TO authenticated;
