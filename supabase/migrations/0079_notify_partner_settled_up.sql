-- 0079_notify_partner_settled_up.sql
--
-- Feature: when one partner settles the shared balance, notify the other partner.
--
-- Settling is a SHARED-family event (the running tally belongs to both members),
-- so surfacing it to the partner is consistent with the privacy model — there is
-- no personal data involved, only "your shared balance was settled".
--
-- Implementation: the notification is written INSIDE rpc_mark_settled, on the
-- path that actually inserts a NEW settlement watermark. The idempotent
-- short-window duplicate path (double-click / both partners at once) returns
-- before reaching it, so exactly one notification is created per real
-- settlement — naturally correct under "settle anytime" (migration 0078).
--
-- The notification INSERT is wrapped in its own BEGIN/EXCEPTION sub-block so a
-- notification failure can NEVER roll back the settlement itself (mirrors the
-- defensive per-row style in rpc_send_month_end_summary_notifications). Push
-- delivery is automatic: the 5-minute cron (0050) delivers any notifications
-- row with push_notified_at IS NULL regardless of type.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Allow the new notification type
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'logging_reminder',
    'budget_threshold',
    'month_end_summary',
    'partner_shared_transaction',
    'partner_settled_up'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rpc_mark_settled — same as 0078, plus a partner notification on real settle
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
  v_partner_id   UUID;
  v_caller_name  TEXT;
  v_currency     TEXT;
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
    -- Zero tally: duplicate submit immediately after a successful settle, or a
    -- genuine "nothing to settle". If a watermark was written in the last few
    -- seconds, return it (idempotent duplicate); otherwise it's a true no-op.
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

  -- Always write a fresh watermark (settle-anytime).
  INSERT INTO public.settlements
    (family_unit_id, settled_by_id, amount_minor, direction, period_label)
  VALUES
    (p_family_unit_id, v_caller, ABS(v_tally), v_direction, v_period_label)
  RETURNING id INTO v_new_id;

  -- ── Notify the partner (non-fatal) ────────────────────────────────────────
  -- A failure here must never roll back the settlement, so it runs in its own
  -- subtransaction whose exception is swallowed.
  BEGIN
    SELECT user_id INTO v_partner_id
      FROM public.family_members
     WHERE family_unit_id = p_family_unit_id
       AND user_id <> v_caller
     LIMIT 1;

    IF v_partner_id IS NOT NULL THEN
      SELECT display_name INTO v_caller_name
        FROM public.profiles WHERE user_id = v_caller;
      v_caller_name := COALESCE(NULLIF(trim(v_caller_name), ''), 'Your partner');

      SELECT currency INTO v_currency
        FROM public.profiles WHERE user_id = v_partner_id;
      v_currency := COALESCE(v_currency, 'USD');

      INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
      VALUES (
        v_partner_id,
        'partner_settled_up',
        v_caller_name || ' settled up',
        'Your shared balance was marked as settled. The running tally has been reset.',
        '/family',
        jsonb_build_object(
          'settlement_id',  v_new_id,
          'family_unit_id', p_family_unit_id,
          'settled_by',     v_caller,
          'amount_minor',   ABS(v_tally),
          'direction',      v_direction,
          'currency',       v_currency
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Swallow — the settlement has already been written and must stand.
    NULL;
  END;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_mark_settled(UUID) TO authenticated;
