-- 0068_fix_settle_up_contribution_display_names.sql
--
-- Fix 1: rpc_settle_up — add `AND t.archived_at IS NULL` so soft-deleted
--   transactions no longer count toward the settle-up tally. The transaction
--   row is soft-deleted (archived_at set) but the transaction_splits row is
--   retained; without this filter the tally stays inflated after deletion.
--
-- Fix 2: rpc_get_transaction_display_names — new SECURITY DEFINER function
--   that resolves account_name and category_name for a set of transaction IDs,
--   bypassing the accounts/categories RLS (owner-only) that makes partner-owned
--   shared transaction names appear as "[deleted]" in the transaction list view.
--   The function checks auth_can_view_transaction so the caller only sees names
--   for transactions they are permitted to read.
--
-- NOTE: an earlier draft of this migration also redefined
--   rpc_get_contribution_analysis to owner-based (raw upfront spending) totals.
--   That change was reverted before commit: Contribution Analysis stays
--   SPLIT-BASED so each partner's total reflects their effective share of a
--   custom split. Example — a 100 shared expense split 80/20 shows 80 vs 20,
--   NOT 100 vs 0. The split-based definition from migration 0054 remains in
--   effect (it already excludes archived transactions and archived goals).

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 1: rpc_settle_up — add archived_at IS NULL
-- (full body re-stated; signature unchanged from 0037)
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

  -- Sum contributions from splits AFTER the latest watermark.
  -- archived_at IS NULL: exclude soft-deleted transactions (their split records
  -- are retained but should no longer affect the tally after deletion).
  SELECT COALESCE(SUM(
    CASE
      WHEN ts.payer_id = v_caller THEN ts.partner_share_minor   -- caller paid → owed by partner
      ELSE -ts.partner_share_minor                               -- partner paid → caller owes
    END
  ), 0) INTO v_tally
  FROM public.transaction_splits ts
  JOIN public.transactions t ON t.id = ts.transaction_id
  WHERE t.is_shared = true
    AND t.archived_at IS NULL
    AND (v_cutoff IS NULL OR t.date > (v_cutoff AT TIME ZONE 'UTC')::date)
    AND public.auth_can_view_transaction(t.user_id, t.is_shared, t.date)
    AND (ts.payer_id = v_caller OR ts.payer_id = v_partner_id);

  RETURN v_tally;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_settle_up(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 2: rpc_get_transaction_display_names — resolves account/category names
-- for partner-visible shared transactions, bypassing the owner-only RLS on
-- accounts and categories tables.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_get_transaction_display_names(
  p_transaction_ids UUID[]
)
RETURNS TABLE(transaction_id UUID, account_name TEXT, category_name TEXT)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT
      t.id       AS transaction_id,
      a.name     AS account_name,
      c.name     AS category_name
    FROM public.transactions t
    LEFT JOIN public.accounts   a ON a.id = t.account_id
    LEFT JOIN public.categories c ON c.id = t.category_id
    WHERE t.id = ANY(p_transaction_ids)
      AND t.archived_at IS NULL
      AND public.auth_can_view_transaction(t.user_id, t.is_shared, t.date);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_transaction_display_names(UUID[]) TO authenticated;
