-- Migration 0027: transaction_splits table + rpc_split_transaction + rpc_log_transaction returns UUID
-- Story 7.6: Split a Shared Transaction
--
-- Changes:
--   1. CREATE TABLE transaction_splits — one split record per transaction (UNIQUE)
--   2. DROP/CREATE rpc_log_transaction to RETURN UUID (needed for auto-split call after log)
--   3. CREATE FUNCTION rpc_split_transaction SECURITY DEFINER — validates + upserts split record
--
-- pgTAP UUID block for this story: 11111111-7006-* (iiiiiiii-* is invalid hex — Story 7.4 learnings §22)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. transaction_splits table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.transaction_splits (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id      UUID        NOT NULL REFERENCES public.transactions(id),
  payer_id            UUID        NOT NULL REFERENCES auth.users(id),
  payer_share_minor   BIGINT      NOT NULL,
  partner_share_minor BIGINT      NOT NULL,
  split_method        TEXT        NOT NULL CHECK (split_method IN ('equal','percentage','fixed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(transaction_id)  -- one split record per transaction
);

COMMENT ON TABLE public.transaction_splits IS
  'One row per shared transaction capturing the split amounts between payer and partner.
   UNIQUE(transaction_id) — a transaction has at most one active split. UPSERT on rpc_split_transaction.
   Soft-delete not used here; a new split replaces the old via ON CONFLICT DO UPDATE.
   Added by Story 7.6.';

GRANT SELECT, INSERT, UPDATE ON public.transaction_splits TO authenticated;
REVOKE DELETE, TRUNCATE ON public.transaction_splits FROM anon, authenticated;

ALTER TABLE public.transaction_splits ENABLE ROW LEVEL SECURITY;

-- RLS: user can see splits for transactions they can see (via auth_can_view_transaction predicate)
CREATE POLICY "see splits for visible transactions" ON public.transaction_splits
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_id
        AND public.auth_can_view_transaction(t.user_id, t.is_shared, t.date)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Update rpc_log_transaction to RETURN the new transaction UUID
--    (callers need the UUID to immediately call rpc_split_transaction for Shared txns)
--    Drop the 7-param void form from migration 0026 and recreate returning UUID.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.rpc_log_transaction(uuid, uuid, bigint, date, text, uuid, boolean);

CREATE OR REPLACE FUNCTION public.rpc_log_transaction(
  p_account_id     uuid,
  p_category_id    uuid,
  p_amount_minor   bigint,
  p_date           date,
  p_note           text    DEFAULT NULL,
  p_subcategory_id uuid    DEFAULT NULL,
  p_is_shared      boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_id      uuid;
  v_cat_type     text;
  v_delta        bigint;
  v_new_tx_id    uuid;
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

  -- Validate subcategory if provided.
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

  -- Insert transaction; capture the new UUID.
  INSERT INTO public.transactions
    (user_id, account_id, category_id, subcategory_id, amount_minor, date, type, note, is_shared)
  VALUES
    (v_user_id, p_account_id, p_category_id, p_subcategory_id, p_amount_minor, p_date, v_cat_type, p_note, p_is_shared)
  RETURNING id INTO v_new_tx_id;

  -- Atomically update account balance.
  UPDATE public.accounts
  SET actual_balance_minor = actual_balance_minor + v_delta
  WHERE id = p_account_id
    AND user_id = v_user_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found or not owned by this user';
  END IF;

  RETURN v_new_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_log_transaction(uuid, uuid, bigint, date, text, uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. rpc_split_transaction
--    SECURITY DEFINER: must read both family members' rows under RLS to verify
--    the caller is a member of the transaction owner's family unit.
--    Validates: auth, shared status, math (sum = amount_minor), then UPSERTs split.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_split_transaction(
  p_transaction_id    UUID,
  p_split_method      TEXT,
  p_payer_id          UUID,
  p_payer_share_minor BIGINT,
  p_partner_share_minor BIGINT
) RETURNS void SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_tx     transactions%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Recorder = payer always (v1 rule); reject if caller tries to attribute payment to someone else
  IF p_payer_id <> v_caller THEN
    RAISE EXCEPTION 'payer_id must match the authenticated user' USING ERRCODE = '42501';
  END IF;

  -- Fetch the transaction (bypassing RLS since SECURITY DEFINER)
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction not found' USING ERRCODE = 'P0002';
  END IF;

  -- Only Shared transactions can be split
  IF NOT v_tx.is_shared THEN
    RAISE EXCEPTION 'cannot split a personal transaction' USING ERRCODE = 'P0001';
  END IF;

  -- Verify caller can view the transaction (is owner or family member with join-date access)
  IF NOT public.auth_can_view_transaction(v_tx.user_id, v_tx.is_shared, v_tx.date) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  -- Share amounts must be non-negative
  IF p_payer_share_minor < 0 OR p_partner_share_minor < 0 THEN
    RAISE EXCEPTION 'share amounts must be non-negative' USING ERRCODE = '23514';
  END IF;

  -- Validate math: payer + partner must equal transaction amount
  IF p_payer_share_minor + p_partner_share_minor <> v_tx.amount_minor THEN
    RAISE EXCEPTION 'split amounts do not sum to transaction amount' USING ERRCODE = '23514';
  END IF;

  -- Upsert split record (UNIQUE on transaction_id ensures one split per transaction)
  INSERT INTO public.transaction_splits
    (transaction_id, payer_id, payer_share_minor, partner_share_minor, split_method)
  VALUES
    (p_transaction_id, p_payer_id, p_payer_share_minor, p_partner_share_minor, p_split_method)
  ON CONFLICT (transaction_id) DO UPDATE SET
    payer_id            = EXCLUDED.payer_id,
    payer_share_minor   = EXCLUDED.payer_share_minor,
    partner_share_minor = EXCLUDED.partner_share_minor,
    split_method        = EXCLUDED.split_method;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_split_transaction(UUID, TEXT, UUID, BIGINT, BIGINT) TO authenticated;
