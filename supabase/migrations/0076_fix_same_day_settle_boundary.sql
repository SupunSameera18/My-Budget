-- 0076_fix_same_day_settle_boundary.sql
--
-- Fix: "settle on day D, add transaction on day D, tally doesn't update"
--
-- Root cause: both rpc_settle_up and rpc_edit_transaction compared the
-- settlement boundary using DATE (calendar-day precision). That makes it
-- impossible to separate "transaction created at 9am before settling at noon"
-- from "transaction created at 3pm after settling at noon" — both share the
-- same date.
--
-- Correct approach: compare created_at (TIMESTAMPTZ) against the settlement
-- timestamp (also TIMESTAMPTZ) directly. This is exact and timezone-safe.
--
-- Semantics after this migration:
--   • rpc_settle_up tally  — counts transactions where created_at > settled_at
--   • rpc_edit_transaction — blocks edits where created_at <= settled_at
--   • UI isSettleLocked    — same: new Date(created_at) <= new Date(lastSettledAt)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. rpc_settle_up — filter by created_at > v_cutoff (TIMESTAMPTZ, no DATE cast)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_settle_up(
  p_family_unit_id UUID
) RETURNS BIGINT
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql AS $$
DECLARE
  v_caller     UUID := auth.uid();
  v_partner_id UUID;
  v_cutoff     TIMESTAMPTZ;
  v_tally      BIGINT := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_unit_id = p_family_unit_id AND user_id = v_caller
  ) THEN
    RETURN 0;
  END IF;

  SELECT user_id INTO v_partner_id
  FROM public.family_members
  WHERE family_unit_id = p_family_unit_id AND user_id <> v_caller
  LIMIT 1;

  SELECT MAX(settled_at) INTO v_cutoff
  FROM public.settlements
  WHERE family_unit_id = p_family_unit_id;

  SELECT COALESCE(SUM(
    (CASE
       WHEN ts.transaction_id IS NULL
         THEN CASE WHEN t.user_id = v_caller THEN t.amount_minor ELSE 0 END
       WHEN ts.payer_id = v_caller
         THEN ts.payer_share_minor
       ELSE ts.partner_share_minor
     END)
    -
    (CASE
       WHEN t.user_id = v_caller
         THEN t.amount_minor / 2
       ELSE t.amount_minor - (t.amount_minor / 2)
     END)
  ), 0) INTO v_tally
  FROM public.transactions t
  LEFT JOIN public.transaction_splits ts ON ts.transaction_id = t.id
  WHERE t.is_shared = true
    AND t.archived_at IS NULL
    AND (v_cutoff IS NULL OR t.created_at > v_cutoff)
    AND public.auth_can_view_transaction(t.user_id, t.is_shared, t.date)
    AND (t.user_id = v_caller OR t.user_id = v_partner_id);

  RETURN v_tally;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_settle_up(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rpc_edit_transaction — guard by created_at <= v_cutoff (TIMESTAMPTZ, exact)
--    Removes the date/timezone conversion path entirely.
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
  v_old_created_at     timestamptz;
  v_old_cat_type       text;
  v_new_cat_type       text;
  v_reverse_delta      bigint;
  v_new_delta          bigint;
  v_changed_fields     jsonb;
  v_family_unit_id     uuid;
  v_settled_at         timestamptz;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'amount_minor must be greater than 0, got %', p_amount_minor;
  END IF;

  SELECT account_id, category_id, amount_minor, date, note, subcategory_id, created_at
    INTO v_old_account_id, v_old_category_id, v_old_amount_minor,
         v_old_date, v_old_note, v_old_subcategory_id, v_old_created_at
    FROM public.transactions
   WHERE id          = p_transaction_id
     AND user_id     = v_user_id
     AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found, not owned, or already deleted';
  END IF;

  -- Settled-period guard (FR-15a / FR-49): block edits to transactions that
  -- existed at the moment of settlement (created_at <= settled_at). Transactions
  -- created after settlement are always editable, even if same calendar day.
  SELECT fm.family_unit_id INTO v_family_unit_id
    FROM public.family_members fm
   WHERE fm.user_id = v_user_id
   LIMIT 1;

  IF v_family_unit_id IS NOT NULL THEN
    SELECT MAX(s.settled_at) INTO v_settled_at
      FROM public.settlements s
     WHERE s.family_unit_id = v_family_unit_id;

    IF v_settled_at IS NOT NULL AND v_old_created_at <= v_settled_at THEN
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

  IF v_old_amount_minor <> p_amount_minor THEN
    UPDATE public.transaction_splits
       SET payer_share_minor   = CEIL(p_amount_minor::NUMERIC / 2)::BIGINT,
           partner_share_minor = p_amount_minor - CEIL(p_amount_minor::NUMERIC / 2)::BIGINT,
           split_method        = 'equal',
           updated_at          = now()
     WHERE transaction_id = p_transaction_id;
  END IF;

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
