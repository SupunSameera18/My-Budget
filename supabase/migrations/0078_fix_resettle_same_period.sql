-- 0078_fix_resettle_same_period.sql
--
-- Fix: "Mark as settled works the first time in a month but does nothing on
-- subsequent settles the same month — the success toast shows, but the tally
-- and the contribution analysis don't reset."
--
-- Root cause: rpc_mark_settled (migrations 0038 / 0054) treated a settlement as
-- idempotent PER CALENDAR MONTH:
--
--     v_period_label := to_char(now(), 'YYYY-MM');
--     SELECT id INTO v_new_id FROM settlements
--      WHERE family_unit_id = ... AND period_label = v_period_label;
--     IF v_new_id IS NOT NULL THEN RETURN v_new_id;   -- early-return, writes nothing
--
-- The first settle of a month wrote a watermark; any later settle in the SAME
-- month found that row and returned early WITHOUT advancing settled_at. Because
-- rpc_settle_up and rpc_get_contribution_analysis both use MAX(settled_at) as
-- their cutoff, the balance and contribution never reset — yet the RPC returned
-- success, so the UI still showed "Balance settled". This directly contradicts
-- Story 8.2 "Settle Anytime" (a family may settle as many times as they like).
-- The settlements_unique_period UNIQUE(family_unit_id, period_label) constraint
-- (migration 0038) enforced the same wrong "one settlement per month" assumption
-- at the table level.
--
-- Fix:
--   1. Drop settlements_unique_period — multiple settlements per period are valid.
--   2. Rewrite rpc_mark_settled: remove the month-based early-return. A deliberate
--      re-settle (new shared spending since the last watermark → non-zero tally)
--      now always writes a fresh watermark, so the tally and contribution reset.
--
-- Concurrency / double-submit is still handled:
--   - pg_advisory_xact_lock(family_unit_id) serializes simultaneous calls.
--   - A SHORT-WINDOW idempotency that fires ONLY when the tally is already zero:
--     after a successful settle the tally is 0, so a duplicate submit (double
--     click, or both partners clicking at once) computes tally = 0 AND finds a
--     just-written watermark → it returns that row gracefully instead of raising
--     P0001. A genuine zero-balance settle (no recent watermark) still raises
--     P0001 (Phase 2 review patch D1). A deliberate re-settle never hits this
--     branch because its tally is non-zero.
--
-- period_label is retained (NOT NULL, informational only — no query keys on it;
-- the app reads settlements by settled_at).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop the one-settlement-per-month uniqueness constraint
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.settlements
  DROP CONSTRAINT IF EXISTS settlements_unique_period;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rpc_mark_settled — settle-anytime: always write a fresh watermark when the
--    balance is non-zero; short-window idempotency only for zero-tally duplicates.
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
  v_recent_id    UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_unit_id = p_family_unit_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'not a family member' USING ERRCODE = '42501';
  END IF;

  -- Advisory lock: serialize concurrent calls from both partners for the same
  -- family unit. Released automatically at COMMIT/ROLLBACK.
  PERFORM pg_advisory_xact_lock(hashtext(p_family_unit_id::text));

  -- Server-authoritative tally as of the latest watermark.
  v_tally := public.rpc_settle_up(p_family_unit_id);

  IF v_tally = 0 THEN
    -- Tally is zero. This is either a duplicate submit immediately after a
    -- successful settle (our own watermark just reset the tally to 0) or a
    -- genuine "nothing to settle". If a watermark was written in the last few
    -- seconds, treat this as the idempotent duplicate and return it; otherwise
    -- it's a true zero-balance no-op (Phase 2 review patch D1).
    SELECT id INTO v_recent_id
      FROM public.settlements
     WHERE family_unit_id = p_family_unit_id
       AND settled_at > now() - interval '5 seconds'
     ORDER BY settled_at DESC
     LIMIT 1;

    IF v_recent_id IS NOT NULL THEN
      RETURN v_recent_id;
    END IF;

    RAISE EXCEPTION 'Cannot mark a zero-balance period as settled' USING ERRCODE = 'P0001';
  END IF;

  -- Direction: positive tally → partner owes caller → b_to_a; negative → a_to_b.
  IF v_tally > 0 THEN
    v_direction := 'b_to_a';
  ELSE
    v_direction := 'a_to_b';
  END IF;

  v_period_label := to_char(now(), 'YYYY-MM');

  -- Always write a fresh watermark (settle-anytime). No ON CONFLICT — the
  -- per-period unique constraint is gone; multiple settlements per period are
  -- the intended behaviour.
  INSERT INTO public.settlements
    (family_unit_id, settled_by_id, amount_minor, direction, period_label)
  VALUES
    (p_family_unit_id, v_caller, ABS(v_tally), v_direction, v_period_label)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_mark_settled(UUID) TO authenticated;
