-- 0075_edit_shared_transaction_any_partner_amount.sql
--
-- Removes the owner-only restriction on amount edits for shared transactions.
-- Either family member may now change the amount, matching the same permissions
-- already in place for note and category edits.

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
  v_caller          UUID := auth.uid();
  v_tx              RECORD;
  v_changed_fields  JSONB := '{}'::JSONB;
  v_row_count       INT;
  v_new_payer_share BIGINT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT id, user_id, is_shared, date, note, category_id, amount_minor
    INTO v_tx
    FROM public.transactions
   WHERE id = p_transaction_id
     AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_tx.is_shared THEN
    RAISE EXCEPTION 'use editTransaction for personal transactions' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.auth_can_view_transaction(v_tx.user_id, v_tx.is_shared, v_tx.date) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  -- Category must belong to the transaction owner regardless of who is calling
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

  -- Recalculate split proportionally if amount changed and a split exists
  IF p_amount_minor IS DISTINCT FROM v_tx.amount_minor THEN
    IF EXISTS (SELECT 1 FROM public.transaction_splits WHERE transaction_id = p_transaction_id) THEN
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

  IF v_changed_fields != '{}'::JSONB THEN
    INSERT INTO public.activity_trail (user_id, transaction_id, change_type, changed_fields)
    VALUES (v_caller, p_transaction_id, 'edit', v_changed_fields);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_edit_shared_transaction(UUID, BIGINT, TEXT, UUID)
  TO authenticated;
