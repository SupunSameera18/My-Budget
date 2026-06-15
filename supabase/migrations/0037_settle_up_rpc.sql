-- 0037_settle_up_rpc.sql
-- Story 8.1: Settle-Up Tally Math (Carryover Golden Tests First)
--
-- Creates:
--   1. settlements table — watermark records for when a family unit settles its balance
--   2. rpc_settle_up(p_family_unit_id) RETURNS BIGINT — server-authoritative tally
--
-- Sign convention: positive = caller is owed money; negative = caller owes money.
-- Pattern mirrors rpc_get_contribution_analysis (SECURITY DEFINER for family_members JOIN).
-- pgTAP UUID block: 11111111-8001-* (alice=001, bob=002, stranger=003, family_unit=010)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. settlements table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.settlements (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_unit_id UUID        NOT NULL REFERENCES public.family_units(id),
  settled_by_id  UUID        NOT NULL REFERENCES auth.users(id),
  amount_minor   BIGINT      NOT NULL,
  direction      TEXT        NOT NULL CHECK (direction IN ('a_to_b', 'b_to_a')),
  settled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_label   TEXT        NOT NULL
);

GRANT SELECT, INSERT ON public.settlements TO authenticated;
REVOKE DELETE, TRUNCATE ON public.settlements FROM anon, authenticated;

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

-- Family members of the family_unit_id may SELECT; INSERT goes through RPC only.
CREATE POLICY "family members can view settlements" ON public.settlements
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.family_members fm
      WHERE fm.family_unit_id = settlements.family_unit_id
        AND fm.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rpc_settle_up — server-authoritative tally (READ ONLY, no side effects)
--
-- WHY SECURITY DEFINER:
--   Needs to JOIN family_members to find the partner's user_id.
--   RLS on family_members restricts each user to their own row — under INVOKER
--   the partner row is invisible, making partner identification impossible.
--   SECURITY DEFINER allows the full table scan; the explicit caller membership
--   check below guards against unauthorised access.
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

  -- Sum contributions from splits AFTER the latest watermark
  SELECT COALESCE(SUM(
    CASE
      WHEN ts.payer_id = v_caller THEN ts.partner_share_minor   -- caller paid → owed by partner
      ELSE -ts.partner_share_minor                               -- partner paid → caller owes
    END
  ), 0) INTO v_tally
  FROM public.transaction_splits ts
  JOIN public.transactions t ON t.id = ts.transaction_id
  WHERE t.is_shared = true
    AND (v_cutoff IS NULL OR t.date > v_cutoff::date)
    AND public.auth_can_view_transaction(t.user_id, t.is_shared, t.date)
    AND (ts.payer_id = v_caller OR ts.payer_id = v_partner_id);

  RETURN v_tally;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_settle_up(UUID) TO authenticated;
