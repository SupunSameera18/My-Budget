-- 0049_privacy_model_finalization.sql
-- Phase 2 Implementation, Task 1 — finalize the privacy model in code.
--
-- Ratified rule (see phase-2-implementation-plan.md §1, architecture.md AR-15):
--   Shared  → ALWAYS visible to the partner, regardless of join date — in
--             transactions, aggregates (contribution analysis, shared goal
--             pool, settle-up) AND notifications.
--   Personal → NEVER shared with the partner, under any condition — not in
--              views, aggregates, exports, or notifications.
-- The only visibility gate is the is_shared boolean. join_date no longer
-- gates anything for the shared/personal split (it may still be retained as
-- data for display/audit).
--
-- Migration 0034 already applied this rule to transactions (auth_can_view_transaction,
-- rpc_get_contribution_analysis, rpc_reclassify_transaction's Personal→Shared path).
-- Two places regressed/never got the memo:
--
--   1. Shared Goal pool (0031) — auth_can_view_goal, the goal_contributions SELECT
--      policy, and rpc_contribute_goal's partner path all still filter on the
--      viewer's join_date. Remove all three filters.
--
--   2. Partner notifications — migration 0046 (re)introduced a pre-join block into
--      rpc_reclassify_transaction's Personal→Shared path (regressing 0034's removal
--      of that exact check), and rpc_notify_partner_shared_transaction (0044/0047)
--      still gates the notification on `tx.date >= partner.join_date`. Remove both.
--
--   3. rpc_get_contribution_analysis's goal_agg CTE (0030) — 0034 only fixed the
--      shared_txns CTE in this same function ("Goal contributions keep their
--      join-date guard (goals policy unchanged)" — a comment that predates this
--      finalization). Remove the `gc.date >= v_viewer_join_date` filter so goal
--      contributions in Contribution Analysis match the now-unfiltered pool.
--
-- No DROP needed for any of these — all signatures are unchanged from their most
-- recent prior definition (0031 / 0047 / 0046 / 0034), so CREATE OR REPLACE is
-- sufficient.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1a. auth_can_view_goal — drop the join-date gate on Shared goals (mirrors
--     auth_can_view_transaction's shared branch from 0034: same family unit
--     is sufficient, no date comparison).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_can_view_goal(
  p_owner_id     UUID,
  p_is_shared    BOOLEAN,
  p_created_date DATE
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller         UUID := auth.uid();
  v_family_unit_id UUID;
BEGIN
  IF v_caller IS NULL THEN RETURN false; END IF;
  -- Own goal: always visible
  IF p_owner_id = v_caller THEN RETURN true; END IF;
  -- Personal goals of other users: never visible to partner
  IF NOT p_is_shared THEN RETURN false; END IF;

  -- Shared goal: visible to any family member, regardless of when it was
  -- created or when the viewer joined (finalized rule — AR-15).
  SELECT fm_caller.family_unit_id
    INTO v_family_unit_id
    FROM public.family_members fm_caller
    JOIN public.family_members fm_owner
      ON  fm_owner.family_unit_id = fm_caller.family_unit_id
      AND fm_owner.user_id        = p_owner_id
   WHERE fm_caller.user_id = v_caller
   LIMIT 1;

  IF v_family_unit_id IS NULL THEN RETURN false; END IF;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auth_can_view_goal(UUID, BOOLEAN, DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1b. goal_contributions SELECT policy — drop the `date >= join_date` filter
--     on the partner branch; visibility is now solely gated by
--     auth_can_view_goal (own contributions are still always visible).
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "family_member_reads_shared_goal_contributions" ON public.goal_contributions;

CREATE POLICY "family_member_reads_shared_goal_contributions"
  ON public.goal_contributions FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.goals g
       WHERE g.id = goal_contributions.goal_id
         AND public.auth_can_view_goal(g.user_id, g.is_shared, g.created_at::date)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 1c. rpc_contribute_goal — drop the P0003 back-date guard on the partner path.
--     A partner can now contribute (and have contributions counted in the pool)
--     for any date, matching "Shared = always" for the pool itself. The
--     family-membership check (42501 for non-members) is unchanged.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_contribute_goal(
  p_goal_id      uuid,
  p_amount_minor bigint,
  p_date         date DEFAULT CURRENT_DATE
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller          uuid := auth.uid();
  v_goal            goals%ROWTYPE;
  v_contribution_id uuid;
  v_is_member       BOOLEAN;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_goal
  FROM public.goals
  WHERE id = p_goal_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Goal not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_goal.user_id <> v_caller THEN
    -- Partner contribution path
    IF NOT v_goal.is_shared THEN
      RAISE EXCEPTION 'Cannot contribute to another user''s personal goal'
        USING ERRCODE = 'P0001';
    END IF;

    -- Verify caller is a family member with the goal owner (SECURITY DEFINER reads both rows).
    -- No join_date guard on p_date — Shared goal pool accepts contributions for
    -- any date, matching the "Shared = always" rule (AR-15).
    SELECT true INTO v_is_member
      FROM public.family_members fm_me
      JOIN public.family_members fm_owner
        ON  fm_owner.family_unit_id = fm_me.family_unit_id
        AND fm_owner.user_id        = v_goal.user_id
     WHERE fm_me.user_id = v_caller
     LIMIT 1;

    IF v_is_member IS NULL THEN
      RAISE EXCEPTION 'Not a family member of goal owner' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.goal_contributions (goal_id, user_id, amount_minor, date)
  VALUES (p_goal_id, v_caller, p_amount_minor, p_date)
  RETURNING id INTO v_contribution_id;

  RETURN v_contribution_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_contribute_goal(uuid, bigint, date) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2a. rpc_reclassify_transaction — remove the pre-join block that migration
--     0046 reintroduced into the Personal→Shared path (0034 had already
--     removed this exact check; 0046's rewrite silently brought it back).
--     The rest of 0046's body — including the Story 9.7 Shared→Personal
--     notification cleanup — is preserved verbatim.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_reclassify_transaction(
  p_transaction_id UUID,
  p_new_is_shared  BOOLEAN
) RETURNS void
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
AS $$
DECLARE
  v_caller     UUID := auth.uid();
  v_tx         RECORD;
  v_partner_id UUID;
BEGIN
  -- Guard: anonymous callers get nothing
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Load transaction (owner-only — we need user_id to enforce ownership)
  SELECT id, user_id, is_shared, date, amount_minor, archived_at
    INTO v_tx
    FROM public.transactions
   WHERE id = p_transaction_id
     AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction not found' USING ERRCODE = 'P0002';
  END IF;

  -- Guard: only the transaction owner may reclassify
  IF v_tx.user_id <> v_caller THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  -- Guard: already that type — no-op needed
  IF v_tx.is_shared = p_new_is_shared THEN
    RAISE EXCEPTION 'transaction is already that type' USING ERRCODE = 'P0001';
  END IF;

  -- Settled-period guard: implemented in Task 2b (rpc_reclassify_transaction
  -- raises P0004 against the settlements watermark; see 0051_settled_period_guard.sql).

  IF p_new_is_shared = true THEN
    -- ── Personal → Shared ──────────────────────────────────────────────────
    -- No pre-join date block — Shared transactions are visible to partners
    -- regardless of when they were dated (finalized rule — AR-15).

    UPDATE public.transactions
       SET is_shared  = true,
           updated_at = now()
     WHERE id      = p_transaction_id
       AND user_id = v_caller;

    -- Auto-create equal split if none exists
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

    -- Activity trail
    INSERT INTO public.activity_trail (user_id, transaction_id, change_type, changed_fields)
    VALUES (
      v_caller,
      p_transaction_id,
      'reclassified_to_shared',
      jsonb_build_object('is_shared', jsonb_build_object('old', false, 'new', true))
    );

  ELSE
    -- ── Shared → Personal ─────────────────────────────────────────────────

    -- Hard-delete split row (see comment at top of file re: AR-5 exception)
    DELETE FROM public.transaction_splits
     WHERE transaction_id = p_transaction_id;

    -- Flip to Personal
    UPDATE public.transactions
       SET is_shared  = false,
           updated_at = now()
     WHERE id      = p_transaction_id
       AND user_id = v_caller;

    -- Activity trail (partner auto-loses visibility via RLS when is_shared=false)
    INSERT INTO public.activity_trail (user_id, transaction_id, change_type, changed_fields)
    VALUES (
      v_caller,
      p_transaction_id,
      'reclassified_to_personal',
      jsonb_build_object('is_shared', jsonb_build_object('old', true, 'new', false))
    );

    -- [STORY 9.7] Shared→Personal notification cleanup — find the partner who
    -- may have received a partner_shared_transaction notification referencing
    -- this transaction.
    SELECT fm_partner.user_id INTO v_partner_id
      FROM public.family_members fm_caller
      JOIN public.family_members fm_partner
        ON fm_partner.family_unit_id = fm_caller.family_unit_id
       AND fm_partner.user_id <> v_caller
     WHERE fm_caller.user_id = v_caller
     LIMIT 1;

    IF v_partner_id IS NOT NULL THEN
      -- Case A: push not yet delivered → DELETE the notification entirely
      DELETE FROM public.notifications
       WHERE user_id = v_partner_id
         AND type = 'partner_shared_transaction'
         AND (metadata->>'transaction_id') = p_transaction_id::text
         AND push_notified_at IS NULL;

      -- Case B: push already delivered → mark as dismissed so it leaves the inbox
      UPDATE public.notifications
         SET dismissed_at = now(),
             read_at      = COALESCE(read_at, now())
       WHERE user_id = v_partner_id
         AND type = 'partner_shared_transaction'
         AND (metadata->>'transaction_id') = p_transaction_id::text
         AND push_notified_at IS NOT NULL
         AND dismissed_at IS NULL;
    END IF;

  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_reclassify_transaction(UUID, BOOLEAN)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2b. rpc_notify_partner_shared_transaction — remove the join-date invariant
--     (step 4 of 0044/0047): Shared transactions now notify the partner
--     regardless of date, matching visibility (finalized rule — AR-15).
--     The 0047 dismissed-row idempotency fix is preserved verbatim.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_notify_partner_shared_transaction(
  p_transaction_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tx             RECORD;
  v_fm_caller      RECORD;
  v_fm_partner     RECORD;
  v_account        RECORD;
BEGIN
  -- 1. Load transaction — must be Shared and owned by the caller
  SELECT t.id, t.user_id, t.is_shared, t.date, t.amount_minor,
         t.account_id, c.name AS category_name
  INTO v_tx
  FROM public.transactions t
  LEFT JOIN public.categories c ON c.id = t.category_id
  WHERE t.id = p_transaction_id
    AND t.archived_at IS NULL;

  IF NOT FOUND THEN RETURN; END IF;
  IF NOT v_tx.is_shared THEN RETURN; END IF;

  -- Auth guard: caller must own the transaction (defense-in-depth)
  IF v_tx.user_id <> auth.uid() THEN RETURN; END IF;

  -- 2. Get caller's family membership
  SELECT fm.family_unit_id, fm.join_date
  INTO v_fm_caller
  FROM public.family_members fm
  WHERE fm.user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF; -- caller is not in a family

  -- 3. Get partner's family membership
  SELECT fm.user_id AS partner_id
  INTO v_fm_partner
  FROM public.family_members fm
  WHERE fm.family_unit_id = v_fm_caller.family_unit_id
    AND fm.user_id <> auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF; -- no partner yet

  -- 4. No join-date invariant — Shared transactions notify regardless of date
  --    (finalized rule — AR-15; the pre-0049 check lived here).

  -- 5. Get account currency for the notification body
  SELECT currency INTO v_account
  FROM public.accounts
  WHERE id = v_tx.account_id;

  -- 6. Idempotency: skip if partner already has an ACTIVE notification for
  --    this transaction. A dismissed row no longer counts (0047) — a
  --    dismiss-then-reshare cycle must produce a fresh notification.
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = v_fm_partner.partner_id
      AND type = 'partner_shared_transaction'
      AND (metadata->>'transaction_id') = p_transaction_id::text
      AND dismissed_at IS NULL
  ) THEN RETURN; END IF;

  -- 7. Insert notification for the PARTNER (not the caller)
  INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
  VALUES (
    v_fm_partner.partner_id,
    'partner_shared_transaction',
    'Partner added a shared transaction',
    'A new shared transaction was logged. Tap to review.',
    '/transactions/' || p_transaction_id::text,
    jsonb_build_object(
      'transaction_id', p_transaction_id,
      'amount_minor',   v_tx.amount_minor,
      'currency',       COALESCE(v_account.currency, 'USD'),
      'category_name',  COALESCE(v_tx.category_name, '')
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_notify_partner_shared_transaction(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2c. rpc_get_contribution_analysis — remove the join-date filter from the
--     goal_agg CTE (0030/0034). The shared_txns CTE was already fixed in 0034;
--     this brings Shared Goal contributions into the same "always included"
--     rule, matching the goal pool itself (1b above).
-- ─────────────────────────────────────────────────────────────────────────────
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
    -- Shared Goal contributions — no join_date filter (0049: Shared = always,
    -- matching the goal pool's own visibility rule).
    SELECT
      gc.user_id               AS contrib_id,
      SUM(gc.amount_minor)     AS goal_total
      FROM public.goal_contributions gc
      JOIN public.goals g ON g.id = gc.goal_id
     WHERE g.is_shared = true
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
