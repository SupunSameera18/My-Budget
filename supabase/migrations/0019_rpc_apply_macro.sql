-- Migration 0019: rpc_apply_macro + enhanced rpc_delete_transaction (Story 5.2a)
--
-- rpc_apply_macro: atomically creates a transaction and updates account balance for
--   an account-targeted macro. Returns the macro_application_id (linked-set key).
--   Story 5.3 will extend the ELSIF branch for goal-targeted macros.
--
-- rpc_delete_transaction: extends the 0014 implementation to handle linked-set
--   (macro_application_id IS NOT NULL) deletion — all transactions in the set are
--   soft-deleted and their account balances reversed atomically.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. rpc_apply_macro
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_apply_macro(
  p_macro_id  UUID,
  p_date      DATE DEFAULT CURRENT_DATE
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id        UUID;
  v_account_id     UUID;
  v_goal_id        UUID;
  v_category_id    UUID;
  v_amount_minor   BIGINT;
  v_cat_type       TEXT;
  v_delta          BIGINT;
  v_application_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Load and validate macro (must be owned by caller and not archived)
  SELECT account_id, goal_id, category_id, amount_minor
  INTO v_account_id, v_goal_id, v_category_id, v_amount_minor
  FROM public.macros
  WHERE id          = p_macro_id
    AND user_id     = v_user_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Macro not found or not owned' USING ERRCODE = 'P0002';
  END IF;

  -- Derive transaction type from macro's category
  SELECT type INTO v_cat_type
  FROM public.categories
  WHERE id          = v_category_id
    AND user_id     = v_user_id
    AND archived_at IS NULL;

  IF v_cat_type IS NULL THEN
    RAISE EXCEPTION 'Macro category not found, not owned, or archived';
  END IF;

  v_application_id := gen_random_uuid();

  IF v_account_id IS NOT NULL THEN
    -- Account-targeted macro: create transaction and update balance
    v_delta := CASE WHEN v_cat_type = 'income' THEN v_amount_minor ELSE -v_amount_minor END;

    INSERT INTO public.transactions (user_id, account_id, category_id, amount_minor, date, type, macro_application_id)
    VALUES (v_user_id, v_account_id, v_category_id, v_amount_minor, p_date, v_cat_type, v_application_id);

    UPDATE public.accounts
    SET actual_balance_minor = actual_balance_minor + v_delta
    WHERE id          = v_account_id
      AND user_id     = v_user_id
      AND archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account not found or not owned by this user';
    END IF;

  ELSIF v_goal_id IS NOT NULL THEN
    -- Goal-targeted macro: Story 5.3 will implement this branch.
    RAISE EXCEPTION 'Goal-targeted macros are not yet supported' USING ERRCODE = 'P0001';
  END IF;

  -- Update MRU timestamp
  UPDATE public.macros
  SET last_used_at = NOW()
  WHERE id      = p_macro_id
    AND user_id = v_user_id;

  RETURN v_application_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_apply_macro(uuid, date) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rpc_delete_transaction (enhanced — replaces migration 0014 version)
--
-- Single-transaction path (macro_application_id IS NULL): identical to 0014.
-- Linked-set path (macro_application_id IS NOT NULL): cursor loop over all
--   non-archived transactions sharing the same macro_application_id; for each:
--   reverse account balance, soft-delete, write trail entry.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_delete_transaction(
  p_transaction_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id       UUID;
  v_app_id        UUID;
  v_account_id    UUID;
  v_category_id   UUID;
  v_amount_minor  BIGINT;
  v_cat_type      TEXT;
  v_reverse_delta BIGINT;
  rec             RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Load the target transaction
  -- Explicit user_id + archived_at IS NULL: prevent double-deletion (defense-in-depth; §9).
  SELECT account_id, category_id, amount_minor, macro_application_id
  INTO v_account_id, v_category_id, v_amount_minor, v_app_id
  FROM public.transactions
  WHERE id          = p_transaction_id
    AND user_id     = v_user_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found, not owned, or already deleted';
  END IF;

  IF v_app_id IS NULL THEN
    -- ── Single-transaction path (identical to migration 0014) ─────────────────

    -- Derive category type for balance reversal.
    -- archived_at IS NULL: archived category returns NULL → CASE misclassifies, corrupting reversal.
    SELECT type INTO v_cat_type
    FROM public.categories
    WHERE id          = v_category_id
      AND user_id     = v_user_id
      AND archived_at IS NULL;

    IF v_cat_type IS NULL THEN
      RAISE EXCEPTION 'Category not found, not owned, or archived';
    END IF;

    -- Reverse delta: undo the original balance contribution.
    v_reverse_delta := CASE WHEN v_cat_type = 'income'
                            THEN -v_amount_minor
                            ELSE  v_amount_minor END;

    -- Reverse account balance.
    -- Explicit user_id + archived_at IS NULL (defense-in-depth; guard silent no-op on archived account).
    UPDATE public.accounts
    SET actual_balance_minor = actual_balance_minor + v_reverse_delta
    WHERE id          = v_account_id
      AND user_id     = v_user_id
      AND archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account not found, not owned, or archived';
    END IF;

    -- Soft-delete the transaction (UPDATE using existing UPDATE grant; no DELETE needed).
    UPDATE public.transactions
    SET archived_at = NOW(),
        updated_at  = NOW()
    WHERE id      = p_transaction_id
      AND user_id = v_user_id
      AND archived_at IS NULL;

    -- Write activity trail entry (changed_fields = {} for delete).
    INSERT INTO public.activity_trail (user_id, transaction_id, change_type, changed_fields)
    VALUES (v_user_id, p_transaction_id, 'delete', '{}'::JSONB);

  ELSE
    -- ── Linked-set path: delete ALL transactions sharing macro_application_id ──

    FOR rec IN
      SELECT id, account_id, category_id, amount_minor
      FROM public.transactions
      WHERE macro_application_id = v_app_id
        AND user_id              = v_user_id
        AND archived_at IS NULL
    LOOP
      -- Derive category type for this linked transaction.
      SELECT type INTO v_cat_type
      FROM public.categories
      WHERE id          = rec.category_id
        AND user_id     = v_user_id
        AND archived_at IS NULL;

      IF v_cat_type IS NULL THEN
        RAISE EXCEPTION 'Category not found for linked transaction %', rec.id;
      END IF;

      v_reverse_delta := CASE WHEN v_cat_type = 'income'
                              THEN -rec.amount_minor
                              ELSE  rec.amount_minor END;

      UPDATE public.accounts
      SET actual_balance_minor = actual_balance_minor + v_reverse_delta
      WHERE id          = rec.account_id
        AND user_id     = v_user_id
        AND archived_at IS NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Account not found, not owned, or archived for linked transaction %', rec.id;
      END IF;

      UPDATE public.transactions
      SET archived_at = NOW(),
          updated_at  = NOW()
      WHERE id      = rec.id
        AND user_id = v_user_id
        AND archived_at IS NULL;

      INSERT INTO public.activity_trail (user_id, transaction_id, change_type, changed_fields)
      VALUES (v_user_id, rec.id, 'delete', '{}'::JSONB);
    END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_delete_transaction(uuid) TO authenticated;
