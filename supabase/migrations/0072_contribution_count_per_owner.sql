-- 0072_contribution_count_per_owner.sql
--
-- Fix Contribution Analysis transaction_count.
--
-- The per_member CTE counted COUNT(st.tx_id) over a CROSS JOIN of members ×
-- shared transactions, so EVERY member received the same count — the total
-- number of shared transactions in the family (a leftover from the old
-- "shared pool" model). With one shared transaction logged by Maya, both Maya
-- and Sam showed "1 transaction".
--
-- transaction_count is now per-owner: the number of shared transactions each
-- member actually logged. Maya logs one → Maya 1, Sam 0.
--
-- total_paid_minor is unchanged (who-paid amounts: each member's split share,
-- or the full amount for the owner when there is no split row).
--
-- (signature unchanged from 0054)

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
    -- All Shared transactions owned by a family member in the period.
    -- No join_date filter — Shared transactions are visible regardless of date.
    SELECT t.id       AS tx_id,
           t.user_id  AS owner_id,
           t.amount_minor
      FROM public.transactions t
     WHERE t.is_shared = true
       AND t.archived_at IS NULL
       AND (p_period_start IS NULL OR t.date >= p_period_start)
       AND (p_period_end   IS NULL OR t.date <= p_period_end)
       AND t.user_id IN (SELECT m.user_id FROM members m)
  ),
  per_member AS (
    SELECT
      m.user_id                    AS contrib_id,
      -- Per-owner count: shared transactions this member actually logged.
      COUNT(*) FILTER (WHERE st.owner_id = m.user_id) AS tx_count,
      -- Who-paid total: this member's split share, or the full amount when
      -- they own a transaction that has no split row.
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
    -- Shared Goal contributions — no join_date filter (0049: Shared = always,
    -- matching the goal pool's own visibility rule).
    SELECT
      gc.user_id               AS contrib_id,
      SUM(gc.amount_minor)     AS goal_total
      FROM public.goal_contributions gc
      JOIN public.goals g ON g.id = gc.goal_id
     WHERE g.is_shared = true
       AND g.archived_at IS NULL
       AND gc.user_id IN (SELECT m.user_id FROM members m)
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
