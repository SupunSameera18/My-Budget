-- 0039_reconciliation_adjustments.sql
-- Story 8.3: Two-Step Close-the-Month Reconciliation
--
-- Creates:
--   1. reconciliation_adjustments table with CHECK(delta_minor <> 0)
--   2. RLS: family members SELECT; no DELETE/TRUNCATE
--   3. rpc_reconciliation_adjustment(family_unit_id, account_id, delta_minor, note, transaction_id)
--      SECURITY DEFINER — writes one adjustment record per call
--
-- The reconciliation_adjustments table is EXCLUDED from all analytics, budgets, and
-- breathing room. Those features query public.transactions only. No exclusion code
-- is needed — it is correct by construction.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. reconciliation_adjustments table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.reconciliation_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_unit_id UUID NOT NULL REFERENCES public.family_units(id),
  account_id UUID NOT NULL REFERENCES public.accounts(id),
  transaction_id UUID REFERENCES public.transactions(id),
  delta_minor BIGINT NOT NULL CHECK (delta_minor <> 0),
  note TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Grants and RLS
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON public.reconciliation_adjustments TO authenticated;
REVOKE DELETE, TRUNCATE ON public.reconciliation_adjustments FROM anon, authenticated;

ALTER TABLE public.reconciliation_adjustments ENABLE ROW LEVEL SECURITY;

-- Family members may SELECT their own family's adjustment records
CREATE POLICY "family members can view reconciliation adjustments"
  ON public.reconciliation_adjustments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.family_members fm
      WHERE fm.family_unit_id = reconciliation_adjustments.family_unit_id
        AND fm.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. rpc_reconciliation_adjustment — writes one adjustment record per call
--
-- WHY SECURITY DEFINER:
--   Needs to JOIN family_members to verify membership. RLS on family_members
--   restricts each user to their own row — under INVOKER the partner check is
--   structurally impossible.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_reconciliation_adjustment(
  p_family_unit_id  UUID,
  p_account_id      UUID,
  p_delta_minor     BIGINT,
  p_note            TEXT DEFAULT NULL,
  p_transaction_id  UUID DEFAULT NULL
) RETURNS UUID
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql AS $$
DECLARE
  v_caller  UUID := auth.uid();
  v_new_id  UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Verify caller is a member of this family unit
  IF NOT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_unit_id = p_family_unit_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'not a family member' USING ERRCODE = '42501';
  END IF;

  -- Verify account belongs to caller and is not archived (defense-in-depth)
  IF NOT EXISTS (
    SELECT 1 FROM public.accounts
    WHERE id = p_account_id AND user_id = v_caller AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'account not found' USING ERRCODE = 'P0002';
  END IF;

  -- Validate delta non-zero early for a clear error (DB CHECK also enforces this)
  IF p_delta_minor = 0 THEN
    RAISE EXCEPTION 'delta_minor must be non-zero' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.reconciliation_adjustments
    (family_unit_id, account_id, transaction_id, delta_minor, note, created_by)
  VALUES
    (p_family_unit_id, p_account_id, p_transaction_id, p_delta_minor, p_note, v_caller)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_reconciliation_adjustment(UUID, UUID, BIGINT, TEXT, UUID) TO authenticated;
