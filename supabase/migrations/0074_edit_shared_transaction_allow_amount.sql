-- 0074_edit_shared_transaction_allow_amount.sql
--
-- Allows the transaction owner to edit the amount of a shared transaction.
-- Previously the RPC accepted only note/category; amount was structurally blocked.
--
-- Amount edit rules:
--   • Only the transaction owner may change the amount (partner may still
--     edit note/category; any attempt by a non-owner to pass a different
--     amount_minor raises 42501).
--   • When the amount changes and a split record exists, the split is
--     recalculated to keep proportions intact:
--       - split_method = 'equal'  → CEIL(new/2) / floor remainder
--       - split_method != 'equal' → proportional scale of existing amounts
--   • Amount change is recorded in activity_trail changed_fields.

CREATE OR REPLACE FUNCTION public.rpc_edit_shared_transaction(
  p_transaction_id  UUID,
  p_amount_minor    BIGINT,
  p_note            TEXT,
  p_category_id     UUID
) RETURNS void
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
AS $$
DECLARE
  v_caller         UUID := auth.uid();
  v_tx             RECORD;
  v_changed_fields JSONB := '{}'::JSONB;
  v_row_count      INT;
  v_new_payer_share BIGINT;
BEGIN
  -- Guard: anonymous callers get nothing
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Load transaction (no user_id filter — either partner may call this)
  SELECT id, user_id, is_shared, date, note, category_id, amount_minor
    INTO v_tx
    FROM public.transactions
   WHERE id = p_transaction_id
     AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction not found' USING ERRCODE = 'P0002';
  END IF;

  -- Only Shared transactions are editable through this RPC
  IF NOT v_tx.is_shared THEN
    RAISE EXCEPTION 'use editTransaction for personal transactions' USING ERRCODE = 'P0001';
  END IF;

  -- Verify caller can view this Shared transaction (family member + join-date-forward)
  IF NOT public.auth_can_view_transaction(v_tx.user_id, v_tx.is_shared, v_tx.date) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  -- Only the owner may change the amount
  IF p_amount_minor IS DISTINCT FROM v_tx.amount_minor AND v_caller <> v_tx.user_id THEN
    RAISE EXCEPTION 'only the transaction owner can change the amount' USING ERRCODE = '42501';
  END IF;

  -- Validate category belongs to the transaction owner
  IF (SELECT user_id FROM public.categories WHERE id = p_category_id AND archived_at IS NULL)
       IS DISTINCT FROM v_tx.user_id THEN
    RAISE EXCEPTION 'category does not belong to transaction owner' USING ERRCODE = '23514';
  END IF;

  -- Build changed_fields
  IF p_amount_minor IS DISTINCT FROM v_tx.amount_minor THEN
    v_changed_fields := v_changed_fields ||
      jsonb_build_object('amount_minor',
        jsonb_build_object('old', v_tx.amount_minor, 'new', p_amount_minor));
  END IF;

  IF v_tx.note IS DISTINCT FROM p_note THEN
    v_changed_fields := v_changed_fields ||
      jsonb_build_object('note',
        jsonb_build_object('old', v_tx.note, 'new', p_note));
  END IF;

  IF v_tx.category_id IS DISTINCT FROM p_category_id THEN
    v_changed_fields := v_changed_fields ||
      jsonb_build_object('category_id',
        jsonb_build_object('old', v_tx.category_id, 'new', p_category_id));
  END IF;

  -- Update transaction
  UPDATE public.transactions
     SET amount_minor = p_amount_minor,
         note        = p_note,
         category_id = p_category_id,
         updated_at  = now()
   WHERE id          = p_transaction_id
     AND archived_at IS NULL;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count = 0 THEN
    RAISE EXCEPTION 'transaction not found' USING ERRCODE = 'P0002';
  END IF;

  -- Recalculate split if amount changed and a split record exists
  IF p_amount_minor IS DISTINCT FROM v_tx.amount_minor THEN
    IF EXISTS (SELECT 1 FROM public.transaction_splits WHERE transaction_id = p_transaction_id) THEN
      -- For 'equal' splits: re-split evenly (owner gets the extra cent on odd amounts)
      -- For all other splits: scale proportionally preserving the payer's share ratio
      SELECT CASE split_method
               WHEN 'equal' THEN CEIL(p_amount_minor::NUMERIC / 2)::BIGINT
               ELSE ROUND(payer_share_minor::NUMERIC * p_amount_minor::NUMERIC
                          / v_tx.amount_minor::NUMERIC)::BIGINT
             END
        INTO v_new_payer_share
        FROM public.transaction_splits
       WHERE transaction_id = p_transaction_id;

      UPDATE public.transaction_splits
         SET payer_share_minor   = v_new_payer_share,
             partner_share_minor = p_amount_minor - v_new_payer_share
       WHERE transaction_id = p_transaction_id;
    END IF;
  END IF;

  -- Only write trail when something actually changed
  IF v_changed_fields != '{}'::JSONB THEN
    INSERT INTO public.activity_trail (user_id, transaction_id, change_type, changed_fields)
    VALUES (v_caller, p_transaction_id, 'edit', v_changed_fields);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_edit_shared_transaction(UUID, BIGINT, TEXT, UUID)
  TO authenticated;
