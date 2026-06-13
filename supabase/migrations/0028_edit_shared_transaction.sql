-- 0028_edit_shared_transaction.sql
-- Story 7.7: Either-Partner Shared Edit with Activity Trail
--
-- Adds:
--   rpc_edit_shared_transaction  — SECURITY DEFINER; note/category edit for Shared txns;
--                                   atomically writes activity_trail entry.
--   rpc_get_transaction_owner_categories — SECURITY DEFINER; returns the transaction
--                                   owner's categories so partners can see valid choices.
--
-- WHY SECURITY DEFINER:
--   rpc_edit_shared_transaction needs to: (1) read both family-members rows to call
--   auth_can_view_transaction; (2) read the transaction without a user_id filter (either
--   partner may be the caller); (3) write an activity_trail entry as the caller.
--   SECURITY INVOKER would expose family_members only for the caller, making partner-
--   visibility checks structurally impossible.
--   The explicit auth.uid() IS NULL guard prevents anonymous exploitation.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. rpc_edit_shared_transaction
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_edit_shared_transaction(
  p_transaction_id  UUID,
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
BEGIN
  -- Guard: anonymous callers get nothing
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Load transaction (no user_id filter — either partner may call this)
  SELECT id, user_id, is_shared, date, note, category_id
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

  -- Validate category belongs to the transaction owner (defense-in-depth; client validated too)
  IF (SELECT user_id FROM public.categories WHERE id = p_category_id AND archived_at IS NULL)
       IS DISTINCT FROM v_tx.user_id THEN
    RAISE EXCEPTION 'category does not belong to transaction owner' USING ERRCODE = '23514';
  END IF;

  -- Build changed_fields jsonb — same format as rpc_edit_transaction for UI compatibility
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

  -- Update (no amount, no user_id — structural protection against amount change)
  UPDATE public.transactions
     SET note        = p_note,
         category_id = p_category_id,
         updated_at  = now()
   WHERE id          = p_transaction_id
     AND archived_at IS NULL;

  -- Guard: if the UPDATE hit 0 rows the transaction was archived between SELECT and UPDATE
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count = 0 THEN
    RAISE EXCEPTION 'transaction not found' USING ERRCODE = 'P0002';
  END IF;

  -- Only write trail when something actually changed (mirrors rpc_edit_transaction behaviour)
  IF v_changed_fields != '{}'::JSONB THEN
    INSERT INTO public.activity_trail (user_id, transaction_id, change_type, changed_fields)
    VALUES (v_caller, p_transaction_id, 'edit', v_changed_fields);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_edit_shared_transaction(UUID, TEXT, UUID)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rpc_get_transaction_owner_categories
-- Returns the transaction owner's active categories so a non-owner partner
-- can populate the category dropdown with valid choices.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_get_transaction_owner_categories(
  p_transaction_id UUID
) RETURNS TABLE (cat_id UUID, name TEXT, type TEXT)
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

  SELECT t.user_id, t.is_shared, t.date INTO v_tx
    FROM public.transactions t
   WHERE t.id = p_transaction_id AND t.archived_at IS NULL;

  IF NOT FOUND THEN RETURN; END IF;

  -- Caller must be able to view the transaction
  IF NOT public.auth_can_view_transaction(v_tx.user_id, v_tx.is_shared, v_tx.date) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT c.id AS cat_id, c.name, c.type
      FROM public.categories c
     WHERE c.user_id    = v_tx.user_id
       AND c.archived_at IS NULL
     ORDER BY c.type, c.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_transaction_owner_categories(UUID)
  TO authenticated;
