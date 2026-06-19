-- 0073_fix_reclassify_personal_to_shared_no_split.sql
--
-- Bug fix: rpc_reclassify_transaction previously auto-created an equal (50/50)
-- split when reclassifying Personal → Shared. This caused contribution analysis
-- to attribute half the transaction amount to the partner (who paid nothing).
--
-- Correct behaviour: when the owner reclassifies their own personal transaction
-- as shared they retain full credit for the amount they already paid.
-- No split row is created; the contribution query's no-split branch already
-- handles this correctly — owner gets amount_minor, partner gets 0.
--
-- The Shared → Personal path (hard-delete split + flip is_shared) is unchanged.

CREATE OR REPLACE FUNCTION public.rpc_reclassify_transaction(
  p_transaction_id UUID,
  p_new_is_shared  BOOLEAN
) RETURNS void
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
AS $$
DECLARE
  v_caller            UUID := auth.uid();
  v_tx                RECORD;
  v_partner_join_date DATE;
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

  IF p_new_is_shared = true THEN
    -- ── Personal → Shared ──────────────────────────────────────────────────

    -- Pre-join block: find the partner's join_date (if a partner exists)
    SELECT fm_other.join_date INTO v_partner_join_date
      FROM public.family_members fm_caller
      JOIN public.family_members fm_other
        ON fm_other.family_unit_id = fm_caller.family_unit_id
       AND fm_other.user_id <> fm_caller.user_id
     WHERE fm_caller.user_id = v_caller
     LIMIT 1;

    -- If no partner yet, v_partner_join_date IS NULL → skip block (allow)
    IF v_partner_join_date IS NOT NULL AND v_tx.date < v_partner_join_date THEN
      RAISE EXCEPTION 'pre-join transaction cannot be shared' USING ERRCODE = 'P0003';
    END IF;

    -- Flip to Shared — no split created: the owner already paid the full amount
    -- and retains full credit in contribution analysis (no-split branch = owner
    -- gets amount_minor, partner gets 0).
    UPDATE public.transactions
       SET is_shared  = true,
           updated_at = now()
     WHERE id      = p_transaction_id
       AND user_id = v_caller;

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

    -- Hard-delete split row (AR-5 exception; see 0029 for rationale)
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

  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_reclassify_transaction(UUID, BOOLEAN)
  TO authenticated;
