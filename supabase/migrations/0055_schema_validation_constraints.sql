-- Migration 0055: schema validation constraints (Phase 2 Task 5)
--
-- Adds DB-level enforcement for invariants that were previously enforced
-- only at the Zod layer. Defense-in-depth: a row written by a future RPC
-- or direct SQL that bypasses the Zod schema will still be rejected.
--
-- Covered in this migration:
--   1. profiles.reminder_time format CHECK ('HH:MM' 24-hour, or NULL)
--   2. accounts.name and categories.name length CHECK (1–50 chars)
--   3. subcategories.name length CHECK (1–50 chars)
--   4. p_date range guard added to rpc_internal_transfer and rpc_external_transfer
--      (rejects dates before 1990-01-01 or after 2100-12-31)
--   5. Notification type CHECK alignment verified (already in 0040; no change needed)
--   6. actual_balance_minor >= 0: SKIPPED — bank accounts can go negative (overdraft)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. profiles.reminder_time format CHECK
-- ─────────────────────────────────────────────────────────────────────────────
-- Ensures any reminder_time written outside the Zod validation path (e.g. direct
-- SQL, future RPCs) still conforms to 'HH:MM' 24-hour format or is NULL.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_reminder_time_format
  CHECK (reminder_time IS NULL OR reminder_time ~ '^([01]\d|2[0-3]):[0-5]\d$');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. accounts.name length CHECK
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_name_length
  CHECK (char_length(name) BETWEEN 1 AND 50);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. categories.name length CHECK
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.categories
  ADD CONSTRAINT categories_name_length
  CHECK (char_length(name) BETWEEN 1 AND 50);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. subcategories.name length CHECK
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.subcategories
  ADD CONSTRAINT subcategories_name_length
  CHECK (char_length(name) BETWEEN 1 AND 50);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. p_date range guard — rpc_internal_transfer
-- ─────────────────────────────────────────────────────────────────────────────
-- DROP + CREATE is required because we are changing the function body while
-- keeping the exact same parameter list and return type.
DROP FUNCTION IF EXISTS public.rpc_internal_transfer(uuid, uuid, bigint, date, text);

CREATE OR REPLACE FUNCTION public.rpc_internal_transfer(
  p_from_account_id uuid,
  p_to_account_id   uuid,
  p_amount_minor    bigint,
  p_date            date,
  p_note            text default null
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_id  uuid;
  v_rowcount integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'amount_minor must be greater than 0, got %', p_amount_minor;
  END IF;

  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'Source and destination accounts must be different';
  END IF;

  IF p_date < '1990-01-01'::date OR p_date > '2100-12-31'::date THEN
    RAISE EXCEPTION 'Date out of allowed range (1990-01-01 to 2100-12-31), got %', p_date
      USING ERRCODE = '22008';
  END IF;

  -- Verify source is owned and active
  PERFORM 1 FROM public.accounts
  WHERE id = p_from_account_id
    AND user_id = v_user_id
    AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source account not found, not owned by caller, or archived';
  END IF;

  -- Verify destination is owned and active
  PERFORM 1 FROM public.accounts
  WHERE id = p_to_account_id
    AND user_id = v_user_id
    AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Destination account not found, not owned by caller, or archived';
  END IF;

  -- Decrease source
  UPDATE public.accounts
  SET actual_balance_minor = actual_balance_minor - p_amount_minor
  WHERE id = p_from_account_id AND user_id = v_user_id;
  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'Source account update failed — account may have been deleted concurrently';
  END IF;

  -- Increase destination
  UPDATE public.accounts
  SET actual_balance_minor = actual_balance_minor + p_amount_minor
  WHERE id = p_to_account_id AND user_id = v_user_id;
  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'Destination account update failed — account may have been deleted concurrently';
  END IF;

  -- Record the transfer
  INSERT INTO public.transfers (user_id, type, from_account_id, to_account_id, amount_minor, date, note)
  VALUES (v_user_id, 'internal', p_from_account_id, p_to_account_id, p_amount_minor, p_date, p_note);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_internal_transfer(uuid, uuid, bigint, date, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. p_date range guard — rpc_external_transfer
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.rpc_external_transfer(uuid, text, bigint, date, text);

CREATE OR REPLACE FUNCTION public.rpc_external_transfer(
  p_account_id   uuid,
  p_direction    text,   -- 'in' | 'out'
  p_amount_minor bigint,
  p_date         date,
  p_note         text    default null
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_id  uuid;
  v_rowcount integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'amount_minor must be greater than 0, got %', p_amount_minor;
  END IF;

  IF p_direction NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'direction must be ''in'' or ''out'', got %', p_direction;
  END IF;

  IF p_date < '1990-01-01'::date OR p_date > '2100-12-31'::date THEN
    RAISE EXCEPTION 'Date out of allowed range (1990-01-01 to 2100-12-31), got %', p_date
      USING ERRCODE = '22008';
  END IF;

  -- Verify account is owned and active
  PERFORM 1 FROM public.accounts
  WHERE id = p_account_id
    AND user_id = v_user_id
    AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found, not owned by caller, or archived';
  END IF;

  IF p_direction = 'in' THEN
    UPDATE public.accounts
    SET actual_balance_minor = actual_balance_minor + p_amount_minor
    WHERE id = p_account_id AND user_id = v_user_id AND archived_at IS NULL;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
      RAISE EXCEPTION 'Account update failed — account may have been archived or deleted concurrently';
    END IF;

    INSERT INTO public.transfers (user_id, type, from_account_id, to_account_id, amount_minor, date, note)
    VALUES (v_user_id, 'external', null, p_account_id, p_amount_minor, p_date, p_note);

  ELSE -- 'out'
    UPDATE public.accounts
    SET actual_balance_minor = actual_balance_minor - p_amount_minor
    WHERE id = p_account_id AND user_id = v_user_id AND archived_at IS NULL;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
      RAISE EXCEPTION 'Account update failed — account may have been archived or deleted concurrently';
    END IF;

    INSERT INTO public.transfers (user_id, type, from_account_id, to_account_id, amount_minor, date, note)
    VALUES (v_user_id, 'external', p_account_id, null, p_amount_minor, p_date, p_note);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_external_transfer(uuid, text, bigint, date, text) TO authenticated;
