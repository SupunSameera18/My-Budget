-- 0070_settle_up_who_paid.sql
--
-- Settle-Up model change: "who actually paid" instead of "cost-share owed".
--
-- BEFORE (cost-share model): a shared transaction's split stored each person's
--   SHARE OF THE COST, and the logger was assumed to have fronted the whole
--   amount. The partner simply owed their share — an 80/20 split of a 100 bill
--   logged by Maya meant Sam owed 20.
--
-- AFTER (who-paid model): the split stores how much each person ACTUALLY PAID
--   toward the bill, and settle-up rebalances both people toward an equal 50/50
--   share. Each person's running balance for a transaction is:
--
--       (what they paid)  -  (their fair share = total / 2)
--
--   Example — Maya logs a 100 rent and the split records "Maya paid 80,
--   Sam paid 20": fair share is 50 each, so Maya is +30 (overpaid) and Sam is
--   -30 (underpaid) → Sam owes Maya 30.
--
--   Default (no split row): the logger is treated as having paid the full
--   amount (Maya paid 100, Sam paid 0) → Sam owes his 50 share. This matches
--   the old equal-split default of "partner owes half", so existing behaviour
--   for un-customised shared transactions is preserved.
--
-- Fair-share rounding: for odd totals the OWNER (t.user_id) takes the floor
--   half and the partner the ceil half, deterministically by role — so the two
--   members' independently-computed tallies always sum to exactly 0
--   (conservation law) regardless of who logged or who edited the split.
--
-- Iterates over shared transactions (LEFT JOIN splits) rather than over splits,
-- so transactions with no split row are correctly included via the owner-paid
-- fallback. Retains the archived_at filter (0068) and the settlement watermark.

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

  -- Verify caller is a member of this family unit
  IF NOT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_unit_id = p_family_unit_id AND user_id = v_caller
  ) THEN
    RETURN 0; -- stranger returns 0 (not an error; hides existence of family unit)
  END IF;

  -- Find partner (the other member of the family unit)
  SELECT user_id INTO v_partner_id
  FROM public.family_members
  WHERE family_unit_id = p_family_unit_id AND user_id <> v_caller
  LIMIT 1;

  -- Latest settlement watermark for this family unit
  SELECT MAX(settled_at) INTO v_cutoff
  FROM public.settlements
  WHERE family_unit_id = p_family_unit_id;

  -- Sum, over shared transactions after the latest watermark:
  --   (what the caller paid) - (caller's fair share = total / 2)
  -- payer_share/partner_share record who-paid amounts and always sum to
  -- t.amount_minor; with no split row the owner is treated as paying the full
  -- amount. Fair share is split floor (owner) / ceil (partner) for exact
  -- conservation on odd totals.
  SELECT COALESCE(SUM(
    -- what the caller paid on this transaction
    (CASE
       WHEN ts.transaction_id IS NULL
         THEN CASE WHEN t.user_id = v_caller THEN t.amount_minor ELSE 0 END
       WHEN ts.payer_id = v_caller
         THEN ts.payer_share_minor
       ELSE ts.partner_share_minor
     END)
    -
    -- the caller's fair (half) share — owner floors, partner ceils
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
    AND (v_cutoff IS NULL OR t.date > (v_cutoff AT TIME ZONE 'UTC')::date)
    AND public.auth_can_view_transaction(t.user_id, t.is_shared, t.date)
    AND (t.user_id = v_caller OR t.user_id = v_partner_id);

  RETURN v_tally;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_settle_up(UUID) TO authenticated;
