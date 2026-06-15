-- Migration 0030: rpc_get_contribution_analysis
-- Story 7.9: Contribution Analysis
--
-- Returns per-contributor aggregated totals for Shared transactions and
-- Shared Goal contributions for a given time period.
--
-- SECURITY DEFINER required: family_members RLS only exposes the caller's own
-- row, but this function must enumerate all members in the family unit.
-- Defense-in-depth: explicit join_date filter + is_shared checks inside body.
--
-- pgTAP UUID block: 11111111-7009-* (see dev-learnings §22 convention)

CREATE OR REPLACE FUNCTION public.rpc_get_contribution_analysis(
  p_period_start DATE DEFAULT NULL,
  p_period_end   DATE DEFAULT NULL
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
  v_caller           UUID := auth.uid();
  v_viewer_join_date DATE;
  v_family_unit_id   UUID;
BEGIN
  -- Reject anonymous callers
  IF v_caller IS NULL THEN RETURN; END IF;

  -- Resolve caller's family membership and join date
  SELECT fm.join_date, fm.family_unit_id
    INTO v_viewer_join_date, v_family_unit_id
    FROM public.family_members fm
   WHERE fm.user_id = v_caller
   LIMIT 1;

  -- Solo user → empty result
  IF v_family_unit_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH members AS (
    -- Both members of the family unit
    SELECT fm.user_id
      FROM public.family_members fm
     WHERE fm.family_unit_id = v_family_unit_id
  ),
  shared_txns AS (
    -- Shared transactions owned by a family member, post-join, in period
    SELECT t.id       AS tx_id,
           t.user_id  AS owner_id,
           t.amount_minor
      FROM public.transactions t
     WHERE t.is_shared = true
       AND t.archived_at IS NULL
       -- Defense-in-depth: join_date invariant (belt-and-suspenders over RLS)
       AND t.date >= v_viewer_join_date
       AND (p_period_start IS NULL OR t.date >= p_period_start)
       AND (p_period_end   IS NULL OR t.date <= p_period_end)
       AND t.user_id IN (SELECT m.user_id FROM members m)
  ),
  per_member AS (
    -- Cross-join every family member × every shared transaction → their contribution
    SELECT
      m.user_id                    AS contrib_id,
      COUNT(st.tx_id)              AS tx_count,
      COALESCE(SUM(
        COALESCE(
          -- Split record present: use the appropriate share
          CASE WHEN ts.payer_id = m.user_id
               THEN ts.payer_share_minor
               ELSE ts.partner_share_minor
          END,
          -- No split record: owner paid full amount; partner paid nothing
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
    -- Shared Goal contributions (post-join, in period)
    SELECT
      gc.user_id               AS contrib_id,
      SUM(gc.amount_minor)     AS goal_total
      FROM public.goal_contributions gc
      JOIN public.goals g ON g.id = gc.goal_id
     WHERE g.is_shared = true
       AND gc.user_id IN (SELECT m.user_id FROM members m)
       AND gc.date >= v_viewer_join_date  -- defense-in-depth
       AND (p_period_start IS NULL OR gc.date >= p_period_start)
       AND (p_period_end   IS NULL OR gc.date <= p_period_end)
     GROUP BY gc.user_id
  )
  SELECT
    m.user_id,
    COALESCE(pm.total_paid,   0)::BIGINT,
    COALESCE(pm.tx_count,     0)::BIGINT,
    COALESCE(ga.goal_total,   0)::BIGINT
  FROM members m
  LEFT JOIN per_member pm ON pm.contrib_id = m.user_id
  LEFT JOIN goal_agg   ga ON ga.contrib_id = m.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_contribution_analysis(DATE, DATE) TO authenticated;
