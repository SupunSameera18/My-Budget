-- ─────────────────────────────────────────────────────────────────────────────
-- Maya & Sam test users
-- ─────────────────────────────────────────────────────────────────────────────
-- Guarantees two login-ready users, each in this exact state:
--   • finished onboarding (app loads straight to the dashboard, no wizard)
--   • exactly 1 account (zero balance)
--   • 0 transactions
--
--   Maya — maya@test.com / 11111111
--   Sam  — sam@test.com  / 11111111
--
-- Idempotent & authoritative — safe to run on a fresh DB OR over existing data:
--   • if the user does not exist  → it is created from scratch
--   • if the user already exists  → password is reset, onboarding is marked
--     complete, ALL their transactions are deleted, and the account list is
--     trimmed to exactly one (a new one is created only if they had none)
--
-- NOTE: family membership, settlements and notifications are intentionally left
-- untouched (Maya & Sam are the canonical family-test pair). To also reset those,
-- clear public.settlements / public.notifications / public.family_members for the
-- two user ids separately.
--
-- Run AFTER migrations are applied:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -f supabase/seed-maya-sam.sql
-- or, without psql on PATH:
--   docker exec -i supabase_db_my-budget psql -U postgres -d postgres \
--        < supabase/seed-maya-sam.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  rec           RECORD;
  v_uid         uuid;
  v_keep        uuid;
  v_acct_count  int;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'maya@test.com', 'Maya', 'Maya''s Account'),
      ('aaaaaaaa-0000-4000-8000-000000000002'::uuid, 'sam@test.com',  'Sam',  'Sam''s Account')
    ) AS t(uid, email, display_name, account_name)
  LOOP
    -- ── Resolve the user: reuse the existing row (by email) or mint a new one ─
    SELECT id INTO v_uid FROM auth.users WHERE email = rec.email;

    IF v_uid IS NULL THEN
      -- ── Create from scratch ────────────────────────────────────────────────
      v_uid := rec.uid;

      -- Token fields must be empty strings (not NULL) for GoTrue to load the user.
      INSERT INTO auth.users (
        id, instance_id, aud, role, email,
        encrypted_password, email_confirmed_at,
        confirmation_token, recovery_token, email_change, email_change_token_new,
        created_at, updated_at, raw_app_meta_data, raw_user_meta_data
      ) VALUES (
        v_uid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        rec.email,
        crypt('11111111', gen_salt('bf')),
        now(),
        '', '', '', '',
        now(), now(),
        '{"provider":"email","providers":["email"]}', '{}'
      );
    ELSE
      -- ── Reconcile existing user: (re)set the password, keep email confirmed ─
      UPDATE auth.users
         SET encrypted_password = crypt('11111111', gen_salt('bf')),
             email_confirmed_at  = COALESCE(email_confirmed_at, now()),
             updated_at          = now()
       WHERE id = v_uid;
    END IF;

    -- ── Identity row (required for email/password login). provider_id MUST be
    --    the email address for GoTrue v2. Insert only if missing. ─────────────
    IF NOT EXISTS (
      SELECT 1 FROM auth.identities WHERE user_id = v_uid AND provider = 'email'
    ) THEN
      INSERT INTO auth.identities (
        provider_id, user_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        rec.email,
        v_uid,
        jsonb_build_object(
          'sub',            v_uid::text,
          'email',          rec.email,
          'email_verified', false,
          'phone_verified', false
        ),
        'email',
        now(), now(), now()
      );
    END IF;

    -- ── Finish onboarding ────────────────────────────────────────────────────
    -- The profiles row is auto-created by the on-signup trigger. The (app) layout
    -- gate only requires onboarding_completed_at to be non-null; step 5 mirrors
    -- the real completed-wizard state (features/onboarding/server/actions.ts).
    UPDATE public.profiles
       SET currency                = 'USD',
           display_name            = rec.display_name,
           onboarding_step         = 5,
           onboarding_completed_at = now()
     WHERE user_id = v_uid;

    -- ── Delete ALL of the user's transactions (FK-safe order) ────────────────
    -- transaction_splits and reconciliation_adjustments reference transactions
    -- with NO ACTION, so they must go first; activity_trail cascades on delete.
    DELETE FROM public.transaction_splits
     WHERE transaction_id IN (SELECT id FROM public.transactions WHERE user_id = v_uid);
    DELETE FROM public.reconciliation_adjustments
     WHERE transaction_id IN (SELECT id FROM public.transactions WHERE user_id = v_uid);
    DELETE FROM public.transactions WHERE user_id = v_uid;

    -- ── Guarantee exactly one account ────────────────────────────────────────
    SELECT count(*) INTO v_acct_count FROM public.accounts WHERE user_id = v_uid;

    IF v_acct_count = 0 THEN
      INSERT INTO public.accounts (id, user_id, name, type, actual_balance_minor, currency)
      VALUES (gen_random_uuid(), v_uid, rec.account_name, 'bank', 0, 'USD');
    ELSE
      -- Keep the oldest account; remove any extras (clearing the refs that
      -- restrict an account delete), then zero the kept balance.
      SELECT id INTO v_keep
        FROM public.accounts WHERE user_id = v_uid
        ORDER BY created_at, id LIMIT 1;

      DELETE FROM public.transfers
       WHERE user_id = v_uid
         AND (from_account_id <> v_keep OR to_account_id <> v_keep)
         AND (from_account_id IN (SELECT id FROM public.accounts WHERE user_id = v_uid AND id <> v_keep)
           OR to_account_id   IN (SELECT id FROM public.accounts WHERE user_id = v_uid AND id <> v_keep));
      DELETE FROM public.macros
       WHERE account_id IN (SELECT id FROM public.accounts WHERE user_id = v_uid AND id <> v_keep);
      DELETE FROM public.reconciliation_adjustments
       WHERE account_id IN (SELECT id FROM public.accounts WHERE user_id = v_uid AND id <> v_keep);
      DELETE FROM public.accounts WHERE user_id = v_uid AND id <> v_keep;

      UPDATE public.accounts SET actual_balance_minor = 0 WHERE id = v_keep;
    END IF;

    RAISE NOTICE '✓ % (%) ready — onboarding complete, 1 account, 0 transactions.',
      rec.display_name, rec.email;
  END LOOP;
END $$;
