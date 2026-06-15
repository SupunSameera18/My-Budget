-- 0038_rpc_mark_settled.sql
-- Story 8.2: Directional Settle-Up Tally & Settle Anytime
--
-- Creates:
--   1. UNIQUE constraint on settlements(family_unit_id, period_label) — concurrent safety
--   2. rpc_mark_settled(p_family_unit_id) RETURNS UUID — writes settlement watermark
--
-- The settlements table already exists from migration 0037.
-- rpc_mark_settled is idempotent: concurrent calls in the same period produce one row.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. UNIQUE constraint for idempotency under concurrent calls
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.settlements
  ADD CONSTRAINT settlements_unique_period
  UNIQUE (family_unit_id, period_label);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rpc_mark_settled — writes a settlement watermark for the current period
--
-- WHY SECURITY DEFINER:
--   Needs to JOIN family_members to verify membership and find the partner.
--   RLS on family_members restricts each user to their own row — under INVOKER
--   the partner row is invisible.
-- Idempotency: ON CONFLICT DO NOTHING + re-SELECT handles concurrent calls from
-- both partners simultaneously without producing duplicate rows.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_mark_settled(
  p_family_unit_id UUID
) RETURNS UUID
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql AS $$
DECLARE
  v_caller       UUID := auth.uid();
  v_tally        BIGINT;
  v_direction    TEXT;
  v_period_label TEXT;
  v_new_id       UUID;
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

  -- Idempotency: if a settlement was already written in the current period, return it
  v_period_label := to_char(now(), 'YYYY-MM');
  SELECT id INTO v_new_id
  FROM public.settlements
  WHERE family_unit_id = p_family_unit_id
    AND period_label = v_period_label
  LIMIT 1;

  IF v_new_id IS NOT NULL THEN
    RETURN v_new_id;
  END IF;

  -- Get current tally (rpc_settle_up is pure read — safe to call here)
  v_tally := public.rpc_settle_up(p_family_unit_id);

  -- Direction: positive tally → partner owes caller → b_to_a
  --            negative tally → caller owes partner → a_to_b
  --            zero           → nominal direction
  IF v_tally > 0 THEN
    v_direction := 'b_to_a';
  ELSE
    v_direction := 'a_to_b';
  END IF;

  -- Insert with ON CONFLICT to handle concurrent calls from both partners
  INSERT INTO public.settlements
    (family_unit_id, settled_by_id, amount_minor, direction, period_label)
  VALUES
    (p_family_unit_id, v_caller, ABS(v_tally), v_direction, v_period_label)
  ON CONFLICT ON CONSTRAINT settlements_unique_period DO NOTHING
  RETURNING id INTO v_new_id;

  -- If conflict occurred (concurrent call), re-SELECT the existing row
  IF v_new_id IS NULL THEN
    SELECT id INTO v_new_id
    FROM public.settlements
    WHERE family_unit_id = p_family_unit_id
      AND period_label = v_period_label
    LIMIT 1;
  END IF;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_mark_settled(UUID) TO authenticated;
