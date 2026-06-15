-- Migration 0026: transaction_defaults on profiles + p_is_shared on rpc_log_transaction
-- Story 7.5: Shared/Personal Toggle & Default Split Method
--
-- Changes:
--   1. ADD COLUMN transaction_defaults JSONB DEFAULT NULL to profiles
--      (same pattern as chart_preferences in 0022)
--   2. GRANT UPDATE(transaction_defaults) to authenticated (column-level)
--   3. CREATE OR REPLACE rpc_log_transaction to accept p_is_shared BOOLEAN DEFAULT false
--      (added at the end — backward-compatible; existing callers get false by default)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add transaction_defaults column to profiles
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN transaction_defaults JSONB DEFAULT NULL;

COMMENT ON COLUMN public.profiles.transaction_defaults IS
  'User transaction defaults: { defaultType: "personal"|"shared", defaultSplitMethod: "equal"|"percentage"|"fixed"|"none" }. NULL means use fallback defaults (personal, equal).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Column-level grant so authenticated users can UPDATE their own defaults
--    (existing SELECT/INSERT grants on profiles already cover reads)
-- ─────────────────────────────────────────────────────────────────────────────
GRANT UPDATE (transaction_defaults) ON public.profiles TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Update rpc_log_transaction to accept p_is_shared
--
--    Drop the 6-param signature from 0013 (subcategory update) then replace.
--    Using CREATE OR REPLACE here replaces the 6-param form in-place since
--    the signature (arity/types) is changing — the DROP handles the old grant.
--    New 7-param signature adds p_is_shared BOOLEAN DEFAULT false at the end.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.rpc_log_transaction(uuid, uuid, bigint, date, text, uuid);

CREATE OR REPLACE FUNCTION public.rpc_log_transaction(
  p_account_id     uuid,
  p_category_id    uuid,
  p_amount_minor   bigint,
  p_date           date,
  p_note           text    DEFAULT NULL,
  p_subcategory_id uuid    DEFAULT NULL,
  p_is_shared      boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_id   uuid;
  v_cat_type  text;
  v_delta     bigint;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'amount_minor must be greater than 0, got %', p_amount_minor;
  END IF;

  -- Derive type from category; validates ownership + active status under RLS.
  SELECT type INTO v_cat_type
  FROM public.categories
  WHERE id = p_category_id
    AND user_id = v_user_id
    AND archived_at IS NULL;

  IF v_cat_type IS NULL THEN
    RAISE EXCEPTION 'Category not found, not owned by this user, or archived';
  END IF;

  -- Validate subcategory if provided: must belong to the given category, same user, not archived.
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

  IF v_cat_type = 'income' THEN
    v_delta := p_amount_minor;
  ELSIF v_cat_type = 'expense' THEN
    v_delta := -p_amount_minor;
  ELSE
    RAISE EXCEPTION 'Unexpected category type: %', v_cat_type;
  END IF;

  -- Insert transaction (includes is_shared from p_is_shared).
  INSERT INTO public.transactions
    (user_id, account_id, category_id, subcategory_id, amount_minor, date, type, note, is_shared)
  VALUES
    (v_user_id, p_account_id, p_category_id, p_subcategory_id, p_amount_minor, p_date, v_cat_type, p_note, p_is_shared);

  -- Atomically update account balance.
  UPDATE public.accounts
  SET actual_balance_minor = actual_balance_minor + v_delta
  WHERE id = p_account_id
    AND user_id = v_user_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found or not owned by this user';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_log_transaction(uuid, uuid, bigint, date, text, uuid, boolean) TO authenticated;
