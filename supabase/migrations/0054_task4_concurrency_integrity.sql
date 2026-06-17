-- 0054_task4_concurrency_integrity.sql
-- Phase 2 Task 4: Concurrency, idempotency & data integrity
--
-- Changes:
--  4a. Notification idempotency: partial unique index on notifications +
--      ON CONFLICT DO NOTHING in rpc_send_month_end_summary_notifications.
--  4b. Split/reclassify races:
--        - transaction_splits.updated_at column
--        - UPDATE RLS policy on transaction_splits (owner-only)
--        - rpc_reclassify_transaction: FOR UPDATE lock + split-amount audit in trail
--        - rpc_split_transaction: FOR UPDATE lock + updated_at in ON CONFLICT
--        - rpc_edit_transaction: auto-rebalance split to equal when amount changes
--  4c. Settle-up / close-month atomicity:
--        - rpc_mark_settled: pg_advisory_xact_lock prevents concurrent month-boundary race
--        - rpc_close_month_adjustments: NEW — atomically applies N adjustments
--  4f. Money/type integrity:
--        - rpc_get_contribution_analysis: add g.archived_at IS NULL to goal_agg CTE
--        - rpc_process_budget_threshold_notifications: skip events with budget_limit_minor = 0

-- ─────────────────────────────────────────────────────────────────────────────
-- 4a. Notification idempotency unique index (month_end_summary)
--
-- Backs the EXISTS-then-INSERT check in rpc_send_month_end_summary_notifications
-- to eliminate the TOCTOU race window if two pg_cron invocations overlap.
-- Combined with ON CONFLICT DO NOTHING in the RPC (below), duplicate rows are
-- structurally impossible regardless of timing.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_month_end
  ON public.notifications (user_id, (metadata->>'month_label'))
  WHERE type = 'month_end_summary';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4b. transaction_splits.updated_at column
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.transaction_splits
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4b. UPDATE RLS policy on transaction_splits (owner-only).
-- Without this policy, RLS (enabled in 0027) would deny all UPDATE statements
-- from authenticated users even though the table privilege was granted — a
-- missing-policy denial is distinct from a privilege denial.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "owner can update own transaction splits"
  ON public.transaction_splits
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_id AND t.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4a. rpc_send_month_end_summary_notifications — use ON CONFLICT DO NOTHING
--     backed by the unique index created above.
--     Full body re-stated (CREATE OR REPLACE preserves everything else).
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_month_label      TEXT;
  v_tx_count         INT;
BEGIN
  v_prev_month_start := date_trunc('month', CURRENT_DATE - interval '1 month')::date;
  v_prev_month_end   := (date_trunc('month', CURRENT_DATE) - interval '1 day')::date;
  v_month_label      := to_char(v_prev_month_start, 'YYYY-MM');

  FOR v_user IN SELECT user_id FROM public.profiles
  LOOP
    BEGIN
      SELECT COUNT(*)
      INTO v_tx_count
      FROM public.transactions
      WHERE user_id    = v_user.user_id
        AND date BETWEEN v_prev_month_start AND v_prev_month_end
        AND archived_at IS NULL;

      CONTINUE WHEN v_tx_count = 0;

      -- ON CONFLICT DO NOTHING backed by idx_notif_month_end (unique on
      -- user_id + metadata->>'month_label' where type = 'month_end_summary').
      -- The prior EXISTS check is removed; the unique index is the source of truth.
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
      )
      ON CONFLICT (user_id, (metadata->>'month_label'))
        WHERE type = 'month_end_summary'
      DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'rpc_send_month_end_summary_notifications: skipping user % due to error: %',
        v_user.user_id, SQLERRM;
    END;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_send_month_end_summary_notifications() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4b. rpc_reclassify_transaction — add FOR UPDATE lock + split-amount audit
--
-- Full body re-stated from migration 0051 (last definition).
-- Changes vs 0051:
--   1. SELECT ... FOR UPDATE on the transaction row (prevents concurrent
--      reclassify or split operations on the same row).
--   2. In the Shared→Personal path: capture split amounts into the activity
--      trail BEFORE the hard-DELETE, so auditors can reconstruct what was lost.
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
  v_caller          UUID := auth.uid();
  v_tx              RECORD;
  v_partner_id      UUID;
  v_family_unit_id  UUID;
  v_settled_cutoff  DATE;
  v_owner_tz        TEXT := 'UTC';
  -- split audit variables
  v_split_payer     BIGINT;
  v_split_partner   BIGINT;
  v_split_method    TEXT;
  v_split_found     BOOLEAN := false;
  v_trail_fields    JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE: lock the transaction row so concurrent reclassify / split
  -- calls for the same transaction are serialized at the DB level.
  SELECT id, user_id, is_shared, date, amount_minor, archived_at
    INTO v_tx
    FROM public.transactions
   WHERE id = p_transaction_id
     AND archived_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tx.user_id <> v_caller THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  IF v_tx.is_shared = p_new_is_shared THEN
    RAISE EXCEPTION 'transaction is already that type' USING ERRCODE = 'P0001';
  END IF;

  -- Settled-period guard (FR-15a / FR-49)
  SELECT fm.family_unit_id INTO v_family_unit_id
    FROM public.family_members fm
   WHERE fm.user_id = v_caller
   LIMIT 1;

  IF v_family_unit_id IS NOT NULL THEN
    SELECT COALESCE(p.timezone, 'UTC') INTO v_owner_tz
      FROM public.profiles p
      JOIN public.family_members fm ON p.id = fm.user_id
     WHERE fm.family_unit_id = v_family_unit_id
     ORDER BY fm.join_date ASC
     LIMIT 1;
    -- SELECT INTO sets the var to NULL when no rows are returned; preserve 'UTC' default.
    v_owner_tz := COALESCE(v_owner_tz, 'UTC');

    SELECT (MAX(s.settled_at) AT TIME ZONE v_owner_tz)::date INTO v_settled_cutoff
      FROM public.settlements s
     WHERE s.family_unit_id = v_family_unit_id;

    IF v_settled_cutoff IS NOT NULL AND v_tx.date <= v_settled_cutoff THEN
      RAISE EXCEPTION 'settled period — use correction entry' USING ERRCODE = 'P0004';
    END IF;
  END IF;

  IF p_new_is_shared = true THEN
    -- ── Personal → Shared ──────────────────────────────────────────────────
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

    -- Capture split amounts for the activity trail BEFORE deleting
    SELECT payer_share_minor, partner_share_minor, split_method
      INTO v_split_payer, v_split_partner, v_split_method
      FROM public.transaction_splits
     WHERE transaction_id = p_transaction_id;
    v_split_found := FOUND;

    -- Hard-delete split row (AR-5 exception; see migration 0046 header)
    DELETE FROM public.transaction_splits
     WHERE transaction_id = p_transaction_id;

    UPDATE public.transactions
       SET is_shared  = false,
           updated_at = now()
     WHERE id      = p_transaction_id
       AND user_id = v_caller;

    -- Build trail with optional split audit
    v_trail_fields := jsonb_build_object('is_shared', jsonb_build_object('old', true, 'new', false));
    IF v_split_found THEN
      v_trail_fields := v_trail_fields || jsonb_build_object(
        'split_deleted', jsonb_build_object(
          'payer_share_minor',   v_split_payer,
          'partner_share_minor', v_split_partner,
          'method',              v_split_method
        )
      );
    END IF;

    INSERT INTO public.activity_trail (user_id, transaction_id, change_type, changed_fields)
    VALUES (v_caller, p_transaction_id, 'reclassified_to_personal', v_trail_fields);

    -- [STORY 9.7] Shared→Personal notification cleanup
    SELECT fm_partner.user_id INTO v_partner_id
      FROM public.family_members fm_caller
      JOIN public.family_members fm_partner
        ON fm_partner.family_unit_id = fm_caller.family_unit_id
       AND fm_partner.user_id <> v_caller
     WHERE fm_caller.user_id = v_caller
     LIMIT 1;

    IF v_partner_id IS NOT NULL THEN
      DELETE FROM public.notifications
       WHERE user_id = v_partner_id
         AND type = 'partner_shared_transaction'
         AND (metadata->>'transaction_id') = p_transaction_id::text
         AND push_notified_at IS NULL;

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

GRANT EXECUTE ON FUNCTION public.rpc_reclassify_transaction(UUID, BOOLEAN) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4b. rpc_split_transaction — add FOR UPDATE lock + updated_at in UPSERT
--
-- Full body re-stated from migration 0027.
-- Changes vs 0027:
--   1. SELECT ... FOR UPDATE on the transaction row.
--   2. ON CONFLICT DO UPDATE now also sets updated_at = now().
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_split_transaction(
  p_transaction_id      UUID,
  p_split_method        TEXT,
  p_payer_id            UUID,
  p_payer_share_minor   BIGINT,
  p_partner_share_minor BIGINT
) RETURNS void SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_tx     transactions%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_payer_id <> v_caller THEN
    RAISE EXCEPTION 'payer_id must match the authenticated user' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE: serialize concurrent splits on the same transaction
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_tx.is_shared THEN
    RAISE EXCEPTION 'cannot split a personal transaction' USING ERRCODE = 'P0001';
  END IF;

  IF v_tx.user_id <> v_caller THEN
    RAISE EXCEPTION 'access denied — caller must own the transaction' USING ERRCODE = 'P0002';
  END IF;

  IF p_payer_share_minor < 0 OR p_partner_share_minor < 0 THEN
    RAISE EXCEPTION 'share amounts must be non-negative' USING ERRCODE = '23514';
  END IF;

  IF p_payer_share_minor + p_partner_share_minor <> v_tx.amount_minor THEN
    RAISE EXCEPTION 'split amounts do not sum to transaction amount' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.transaction_splits
    (transaction_id, payer_id, payer_share_minor, partner_share_minor, split_method)
  VALUES
    (p_transaction_id, p_payer_id, p_payer_share_minor, p_partner_share_minor, p_split_method)
  ON CONFLICT (transaction_id) DO UPDATE SET
    payer_id            = EXCLUDED.payer_id,
    payer_share_minor   = EXCLUDED.payer_share_minor,
    partner_share_minor = EXCLUDED.partner_share_minor,
    split_method        = EXCLUDED.split_method,
    updated_at          = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_split_transaction(UUID, TEXT, UUID, BIGINT, BIGINT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4b. rpc_edit_transaction — auto-rebalance split when amount changes
--
-- Full body re-stated from migration 0014.
-- Change vs 0014: if the transaction amount changes and a split record exists,
-- auto-rebalance it to an equal split of the new amount. This keeps the split
-- math valid (payer + partner = amount_minor) after an edit.
-- The UPDATE is permitted because the "owner can update own transaction splits"
-- RLS policy is now added above.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_edit_transaction(
  p_transaction_id  uuid,
  p_account_id      uuid,
  p_category_id     uuid,
  p_amount_minor    bigint,
  p_date            date,
  p_note            text    default null,
  p_subcategory_id  uuid    default null
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_id            uuid;
  v_old_account_id     uuid;
  v_old_category_id    uuid;
  v_old_amount_minor   bigint;
  v_old_date           date;
  v_old_note           text;
  v_old_subcategory_id uuid;
  v_old_cat_type       text;
  v_new_cat_type       text;
  v_reverse_delta      bigint;
  v_new_delta          bigint;
  v_changed_fields     jsonb;
  v_family_unit_id     uuid;
  v_settled_cutoff     DATE;
  v_owner_tz           TEXT := 'UTC';
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'amount_minor must be greater than 0, got %', p_amount_minor;
  END IF;

  SELECT account_id, category_id, amount_minor, date, note, subcategory_id
    INTO v_old_account_id, v_old_category_id, v_old_amount_minor,
         v_old_date, v_old_note, v_old_subcategory_id
    FROM public.transactions
   WHERE id          = p_transaction_id
     AND user_id     = v_user_id
     AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found, not owned, or already deleted';
  END IF;

  -- Settled-period guard (FR-15a / FR-49): consistent with rpc_reclassify_transaction
  SELECT fm.family_unit_id INTO v_family_unit_id
    FROM public.family_members fm
   WHERE fm.user_id = v_user_id
   LIMIT 1;

  IF v_family_unit_id IS NOT NULL THEN
    SELECT COALESCE(p.timezone, 'UTC') INTO v_owner_tz
      FROM public.profiles p
      JOIN public.family_members fm ON p.id = fm.user_id
     WHERE fm.family_unit_id = v_family_unit_id
     ORDER BY fm.join_date ASC
     LIMIT 1;
    -- SELECT INTO sets the var to NULL when no rows are returned; preserve 'UTC' default.
    v_owner_tz := COALESCE(v_owner_tz, 'UTC');

    SELECT (MAX(s.settled_at) AT TIME ZONE v_owner_tz)::date INTO v_settled_cutoff
      FROM public.settlements s
     WHERE s.family_unit_id = v_family_unit_id;

    IF v_settled_cutoff IS NOT NULL AND v_old_date <= v_settled_cutoff THEN
      RAISE EXCEPTION 'Cannot edit a transaction in a settled period' USING ERRCODE = 'P0004';
    END IF;
  END IF;

  SELECT type INTO v_old_cat_type
    FROM public.categories
   WHERE id          = v_old_category_id
     AND user_id     = v_user_id
     AND archived_at IS NULL;

  IF v_old_cat_type IS NULL THEN
    RAISE EXCEPTION 'Original category not found, not owned, or archived';
  END IF;

  SELECT type INTO v_new_cat_type
    FROM public.categories
   WHERE id          = p_category_id
     AND user_id     = v_user_id
     AND archived_at IS NULL;

  IF v_new_cat_type IS NULL THEN
    RAISE EXCEPTION 'Category not found, not owned by this user, or archived';
  END IF;

  IF p_subcategory_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.subcategories
       WHERE id          = p_subcategory_id
         AND category_id = p_category_id
         AND user_id     = v_user_id
         AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Subcategory not found, not under this category, not owned, or archived';
    END IF;
  END IF;

  v_reverse_delta := CASE WHEN v_old_cat_type = 'income' THEN -v_old_amount_minor
                          ELSE  v_old_amount_minor END;
  v_new_delta     := CASE WHEN v_new_cat_type = 'income' THEN  p_amount_minor
                          ELSE -p_amount_minor END;

  IF p_account_id = v_old_account_id THEN
    UPDATE public.accounts
       SET actual_balance_minor = actual_balance_minor + v_reverse_delta + v_new_delta
     WHERE id        = p_account_id
       AND user_id   = v_user_id
       AND archived_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account not found or not owned by this user';
    END IF;
  ELSE
    UPDATE public.accounts
       SET actual_balance_minor = actual_balance_minor + v_reverse_delta
     WHERE id        = v_old_account_id
       AND user_id   = v_user_id
       AND archived_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Original account not found, not owned, or archived';
    END IF;

    UPDATE public.accounts
       SET actual_balance_minor = actual_balance_minor + v_new_delta
     WHERE id        = p_account_id
       AND user_id   = v_user_id
       AND archived_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'New account not found, not owned, or archived';
    END IF;
  END IF;

  UPDATE public.transactions
     SET account_id     = p_account_id,
         category_id    = p_category_id,
         amount_minor   = p_amount_minor,
         date           = p_date,
         note           = p_note,
         type           = v_new_cat_type,
         subcategory_id = p_subcategory_id,
         updated_at     = now()
   WHERE id      = p_transaction_id
     AND user_id = v_user_id
     AND archived_at IS NULL;

  -- 4b: Auto-rebalance split to equal if amount changed.
  -- The UPDATE RLS policy "owner can update own transaction splits" (added in 0054)
  -- permits this UPDATE under SECURITY INVOKER.
  IF v_old_amount_minor <> p_amount_minor THEN
    UPDATE public.transaction_splits
       SET payer_share_minor   = CEIL(p_amount_minor::NUMERIC / 2)::BIGINT,
           partner_share_minor = p_amount_minor - CEIL(p_amount_minor::NUMERIC / 2)::BIGINT,
           split_method        = 'equal',
           updated_at          = now()
     WHERE transaction_id = p_transaction_id;
  END IF;

  -- Build changed_fields jsonb
  v_changed_fields := '{}'::jsonb;

  IF v_old_amount_minor != p_amount_minor THEN
    v_changed_fields := v_changed_fields ||
      jsonb_build_object('amount_minor',
        jsonb_build_object('old', v_old_amount_minor, 'new', p_amount_minor));
  END IF;

  IF v_old_account_id != p_account_id THEN
    v_changed_fields := v_changed_fields ||
      jsonb_build_object('account_id',
        jsonb_build_object('old', v_old_account_id, 'new', p_account_id));
  END IF;

  IF v_old_category_id != p_category_id THEN
    v_changed_fields := v_changed_fields ||
      jsonb_build_object('category_id',
        jsonb_build_object('old', v_old_category_id, 'new', p_category_id));
  END IF;

  IF v_old_date != p_date THEN
    v_changed_fields := v_changed_fields ||
      jsonb_build_object('date',
        jsonb_build_object('old', v_old_date, 'new', p_date));
  END IF;

  IF v_old_note IS DISTINCT FROM p_note THEN
    v_changed_fields := v_changed_fields ||
      jsonb_build_object('note',
        jsonb_build_object('old', v_old_note, 'new', p_note));
  END IF;

  IF v_old_subcategory_id IS DISTINCT FROM p_subcategory_id THEN
    v_changed_fields := v_changed_fields ||
      jsonb_build_object('subcategory_id',
        jsonb_build_object('old', v_old_subcategory_id, 'new', p_subcategory_id));
  END IF;

  IF v_changed_fields != '{}'::jsonb THEN
    INSERT INTO public.activity_trail (user_id, transaction_id, change_type, changed_fields)
    VALUES (v_user_id, p_transaction_id, 'edit', v_changed_fields);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_edit_transaction(uuid, uuid, uuid, bigint, date, text, uuid)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4c. rpc_mark_settled — advisory lock to prevent month-boundary race
--
-- Full body re-stated from migration 0038.
-- Change: pg_advisory_xact_lock on the family_unit_id hash serializes concurrent
-- calls (e.g. both partners hitting "Mark as settled" simultaneously). The lock
-- is released automatically at COMMIT/ROLLBACK.
-- The existing ON CONFLICT DO NOTHING already handles the late-arriving call
-- gracefully; the lock prevents wasted work and duplicate tally snapshots.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_mark_settled(
  p_family_unit_id UUID
) RETURNS UUID
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql AS $$
DECLARE
  v_caller       UUID := auth.uid();
  v_tally        BIGINT;
  v_direction    TEXT;
  v_period_label TEXT;
  v_new_id       UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_unit_id = p_family_unit_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'not a family member' USING ERRCODE = '42501';
  END IF;

  -- Advisory lock: serializes concurrent calls from both partners for the same
  -- family unit. hashtext() maps the UUID string to a 32-bit lock key; collisions
  -- cause harmless extra serialization, not incorrect results.
  PERFORM pg_advisory_xact_lock(hashtext(p_family_unit_id::text));

  v_period_label := to_char(now(), 'YYYY-MM');

  -- Idempotency: if already settled in this period, return the existing row
  SELECT id INTO v_new_id
    FROM public.settlements
   WHERE family_unit_id = p_family_unit_id
     AND period_label   = v_period_label
   LIMIT 1;

  IF v_new_id IS NOT NULL THEN
    RETURN v_new_id;
  END IF;

  v_tally := public.rpc_settle_up(p_family_unit_id);

  IF v_tally = 0 THEN
    RAISE EXCEPTION 'Cannot mark a zero-balance period as settled' USING ERRCODE = 'P0001';
  END IF;

  IF v_tally > 0 THEN
    v_direction := 'b_to_a';
  ELSE
    v_direction := 'a_to_b';
  END IF;

  INSERT INTO public.settlements
    (family_unit_id, settled_by_id, amount_minor, direction, period_label)
  VALUES
    (p_family_unit_id, v_caller, ABS(v_tally), v_direction, v_period_label)
  ON CONFLICT ON CONSTRAINT settlements_unique_period DO NOTHING
  RETURNING id INTO v_new_id;

  IF v_new_id IS NULL THEN
    SELECT id INTO v_new_id
      FROM public.settlements
     WHERE family_unit_id = p_family_unit_id
       AND period_label   = v_period_label
     LIMIT 1;
  END IF;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_mark_settled(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4c. rpc_close_month_adjustments — atomically apply N reconciliation adjustments
--
-- The prior TS closeMonth() action called rpc_reconciliation_adjustment N times
-- as separate HTTP calls (= separate transactions). A failure mid-loop left
-- earlier adjustments committed and later ones absent. This new RPC runs all
-- adjustments inside a single PL/pgSQL transaction, so they either all commit
-- or all roll back.
--
-- p_adjustments: JSONB array of objects:
--   [{account_id: UUID, delta_minor: BIGINT, note: TEXT|null}, ...]
-- Returns the number of adjustment records written.
--
-- WHY SECURITY DEFINER: needs to JOIN family_members to verify membership —
-- RLS restricts each user to their own row.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_close_month_adjustments(
  p_family_unit_id UUID,
  p_adjustments    JSONB
) RETURNS INT
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql AS $$
DECLARE
  v_caller     UUID := auth.uid();
  v_adj        JSONB;
  v_account_id UUID;
  v_delta      BIGINT;
  v_note       TEXT;
  v_count      INT := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_unit_id = p_family_unit_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'not a family member' USING ERRCODE = '42501';
  END IF;

  IF p_adjustments IS NULL OR jsonb_array_length(p_adjustments) = 0 THEN
    RETURN 0;
  END IF;

  FOR v_adj IN SELECT * FROM jsonb_array_elements(p_adjustments)
  LOOP
    v_account_id := (v_adj->>'account_id')::UUID;
    v_delta      := (v_adj->>'delta_minor')::BIGINT;
    v_note       := v_adj->>'note';

    CONTINUE WHEN v_delta = 0;

    -- Defense-in-depth: account must belong to caller and be active
    IF NOT EXISTS (
      SELECT 1 FROM public.accounts
       WHERE id = v_account_id AND user_id = v_caller AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'account not found: %', v_account_id USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.reconciliation_adjustments
      (family_unit_id, account_id, delta_minor, note, created_by)
    VALUES
      (p_family_unit_id, v_account_id, v_delta, v_note, v_caller);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_close_month_adjustments(UUID, JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4f. rpc_get_contribution_analysis — filter archived shared goals
--
-- Full body re-stated from migration 0049 (last definition).
-- Change: add `AND g.archived_at IS NULL` to the goal_agg CTE so contributions
-- to archived Shared Goals are excluded from the analysis.
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
  v_caller           UUID := auth.uid();
  v_family_unit_id   UUID;
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
    SELECT t.id       AS tx_id,
           t.user_id  AS owner_id,
           t.amount_minor
      FROM public.transactions t
     WHERE t.is_shared    = true
       AND t.archived_at  IS NULL
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
      gc.user_id           AS contrib_id,
      SUM(gc.amount_minor) AS goal_total
      FROM public.goal_contributions gc
      JOIN public.goals g ON g.id = gc.goal_id
     WHERE g.is_shared    = true
       AND g.archived_at  IS NULL       -- exclude contributions to archived goals
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4f. rpc_process_budget_threshold_notifications — skip events with $0 limit
--
-- Pre-0042 rows had budget_limit_minor = 0 (the DEFAULT from ADD COLUMN).
-- Processing them would produce a notification with "0%" — skip them.
-- Only events where the limit was correctly captured (budget_limit_minor > 0)
-- produce useful notifications.
-- ─────────────────────────────────────────────────────────────────────────────
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
      AND bte.budget_limit_minor > 0    -- skip stale pre-0042 rows with DEFAULT 0
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
          'budget_name',        v_event.budget_name,
          'pct_used',           round(v_event.pct_used),
          'actual_minor',       v_event.actual_minor,
          'budget_limit_minor', v_event.budget_limit_minor,
          'limit_minor',        v_event.budget_limit_minor,
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

-- Cron-only function: revoke EXECUTE from all authenticated callers
REVOKE EXECUTE ON FUNCTION public.rpc_process_budget_threshold_notifications() FROM PUBLIC, anon, authenticated;
