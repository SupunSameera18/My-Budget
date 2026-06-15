-- Migration 0034: change join-date-forward rule
--
-- OLD: join-date-forward applied to Shared transactions (partner sees Shared
--      only from their join date onward).
-- NEW: Shared transactions are always visible to family members regardless of
--      date. Join-date-forward now applies only to Personal transactions that
--      are cross-visible via mutual privacy sharing.
--
-- Affected objects:
--   auth_can_view_transaction   — core RLS predicate
--   rpc_get_contribution_analysis — removes join_date guard from shared_txns CTE
--   rpc_reclassify_transaction  — removes pre-join block (no longer blocks
--                                 Personal→Shared for pre-join dates)

-- ── 1. auth_can_view_transaction ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_can_view_transaction(
  p_owner_id     UUID,
  p_is_shared    BOOLEAN,
  p_created_date DATE
) RETURNS BOOLEAN
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
AS $$
DECLARE
  v_caller           UUID := auth.uid();
  v_family_unit_id   UUID;
  v_viewer_join_date DATE;
  v_caller_hide      BOOLEAN;
  v_owner_hide       BOOLEAN;
BEGIN
  -- Guard: anonymous callers get nothing
  IF v_caller IS NULL THEN RETURN false; END IF;

  -- Condition 1: own row always visible
  IF p_owner_id = v_caller THEN RETURN true; END IF;

  -- Establish: are caller and owner in the same family unit?
  SELECT fm_caller.family_unit_id, fm_caller.join_date
    INTO v_family_unit_id, v_viewer_join_date
    FROM public.family_members fm_caller
    JOIN public.family_members fm_owner
      ON  fm_owner.family_unit_id = fm_caller.family_unit_id
      AND fm_owner.user_id        = p_owner_id
   WHERE fm_caller.user_id = v_caller
   LIMIT 1;

  -- Not in the same family unit → no cross-user visibility
  IF v_family_unit_id IS NULL THEN RETURN false; END IF;

  IF p_is_shared THEN
    -- Shared row: always visible to family members — no join-date restriction.
    RETURN true;
  ELSE
    -- Personal row of another family member.
    -- Mutual Privacy Toggle: if EITHER member has hide_personal=true, cross-
    -- visibility is off for both.
    SELECT
      (SELECT hide_personal FROM public.family_members
        WHERE family_unit_id = v_family_unit_id AND user_id = v_caller),
      (SELECT hide_personal FROM public.family_members
        WHERE family_unit_id = v_family_unit_id AND user_id = p_owner_id)
    INTO v_caller_hide, v_owner_hide;

    IF COALESCE(v_caller_hide, false) OR COALESCE(v_owner_hide, false) THEN
      RETURN false;
    END IF;

    -- Mutual sharing ON: apply join-date-forward — only post-join personal
    -- transactions are visible to the partner.
    IF p_created_date < v_viewer_join_date THEN RETURN false; END IF;

    RETURN true;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auth_can_view_transaction(UUID, BOOLEAN, DATE)
  TO authenticated;

-- ── 2. rpc_get_contribution_analysis ─────────────────────────────────────────
-- Remove AND t.date >= v_viewer_join_date from shared_txns CTE — Shared
-- transactions now contribute to analysis regardless of when they were dated.
-- Goal contributions keep their join-date guard (goals policy unchanged).
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
  IF v_caller IS NULL THEN RETURN; END IF;

  SELECT fm.join_date, fm.family_unit_id
    INTO v_viewer_join_date, v_family_unit_id
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
      COUNT(st.tx_id)              AS tx_count,
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
    SELECT
      gc.user_id               AS contrib_id,
      SUM(gc.amount_minor)     AS goal_total
      FROM public.goal_contributions gc
      JOIN public.goals g ON g.id = gc.goal_id
     WHERE g.is_shared = true
       AND gc.user_id IN (SELECT m.user_id FROM members m)
       AND gc.date >= v_viewer_join_date
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

-- ── 3. rpc_reclassify_transaction ─────────────────────────────────────────────
-- Remove pre-join block: Personal→Shared is now always allowed regardless of
-- the transaction date, because Shared transactions are visible to partners
-- without any date restriction.
CREATE OR REPLACE FUNCTION public.rpc_reclassify_transaction(
  p_transaction_id UUID,
  p_new_is_shared  BOOLEAN
) RETURNS void
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_tx     RECORD;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT id, user_id, is_shared, date, amount_minor, archived_at
    INTO v_tx
    FROM public.transactions
   WHERE id = p_transaction_id
     AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tx.user_id <> v_caller THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  IF v_tx.is_shared = p_new_is_shared THEN
    RAISE EXCEPTION 'transaction is already that type' USING ERRCODE = 'P0001';
  END IF;

  IF p_new_is_shared = true THEN
    -- ── Personal → Shared ──────────────────────────────────────────────────
    -- No pre-join date block — Shared transactions are visible to partners
    -- regardless of when they were dated.

    UPDATE public.transactions
       SET is_shared  = true,
           updated_at = now()
     WHERE id      = p_transaction_id
       AND user_id = v_caller;

    IF NOT EXISTS (
      SELECT 1 FROM public.transaction_splits
       WHERE transaction_id = p_transaction_id
    ) THEN
      INSERT INTO public.transaction_splits
        (transaction_id, payer_id, payer_share_minor, partner_share_minor, split_method)
      VALUES (
        p_transaction_id,
        v_caller,
        CEIL(v_tx.amount_minor::NUMERIC / 2)::BIGINT,
        v_tx.amount_minor - CEIL(v_tx.amount_minor::NUMERIC / 2)::BIGINT,
        'equal'
      );
    END IF;

    INSERT INTO public.activity_trail (user_id, transaction_id, change_type, changed_fields)
    VALUES (
      v_caller,
      p_transaction_id,
      'reclassified_to_shared',
      jsonb_build_object('is_shared', jsonb_build_object('old', false, 'new', true))
    );

  ELSE
    -- ── Shared → Personal ─────────────────────────────────────────────────

    DELETE FROM public.transaction_splits
     WHERE transaction_id = p_transaction_id;

    UPDATE public.transactions
       SET is_shared  = false,
           updated_at = now()
     WHERE id      = p_transaction_id
       AND user_id = v_caller;

    INSERT INTO public.activity_trail (user_id, transaction_id, change_type, changed_fields)
    VALUES (
      v_caller,
      p_transaction_id,
      'reclassified_to_personal',
      jsonb_build_object('is_shared', jsonb_build_object('old', true, 'new', false))
    );

  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_reclassify_transaction(UUID, BOOLEAN)
  TO authenticated;
