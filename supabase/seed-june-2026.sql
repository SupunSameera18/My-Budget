-- ─────────────────────────────────────────────────────────────────────────────
-- June 2026 Test Data Seed
-- ─────────────────────────────────────────────────────────────────────────────
-- Creates:  1 test user   (test@mybudget.local / TestPass123!)
--           3 accounts    (bank, savings, cash)
--           6 budgets     (monthly, weekly, custom, single-cat, multi-cat)
--           4 goals       + 8 contributions
--           6 macros      (3 account-targeted, 3 goal-targeted)
--          52 transactions (incomes + expenses, all categories, all accounts)
--           5 transfers   (2 internal, 3 external)
--
-- Run AFTER migrations are applied (e.g. after npx supabase db reset):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -f supabase/seed-june-2026.sql
--
-- Sign in at http://localhost:3000 as:
--   Email:    test@mybudget.local
--   Password: TestPass123!
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  -- ── Fixed seed user UUID (deterministic; safe to re-run) ──────────────────
  v_uid  uuid := 'eeeeeeee-eeee-4eee-8eee-000000000001';

  -- ── Account IDs ───────────────────────────────────────────────────────────
  v_bank     uuid := gen_random_uuid();
  v_savings  uuid := gen_random_uuid();
  v_cash     uuid := gen_random_uuid();

  -- ── Category IDs (resolved below after trigger seeds them) ────────────────
  c_salary       uuid; c_freelance    uuid; c_investment   uuid; c_other_income uuid;
  c_housing      uuid; c_groceries    uuid; c_dining       uuid; c_transport    uuid;
  c_utilities    uuid; c_healthcare   uuid; c_entertainment uuid; c_shopping     uuid;
  c_education    uuid; c_other        uuid;

  -- ── Budget IDs ────────────────────────────────────────────────────────────
  b_groceries    uuid := gen_random_uuid();
  b_transport    uuid := gen_random_uuid();
  b_ent_shopping uuid := gen_random_uuid();
  b_weekly_dining uuid := gen_random_uuid();
  b_q2_education uuid := gen_random_uuid();
  b_utilities    uuid := gen_random_uuid();

  -- ── Goal IDs ──────────────────────────────────────────────────────────────
  g_emergency    uuid := gen_random_uuid();
  g_laptop       uuid := gen_random_uuid();
  g_vacation     uuid := gen_random_uuid();
  g_downpayment  uuid := gen_random_uuid();

BEGIN

  -- ── Guard: skip if data already seeded for this user ─────────────────────
  IF EXISTS (SELECT 1 FROM public.accounts WHERE user_id = v_uid) THEN
    RAISE NOTICE 'Seed data already present for test@mybudget.local — skipping.';
    RAISE NOTICE 'Run: npx supabase db reset  then re-run this script for a fresh seed.';
    RETURN;
  END IF;

  -- ── 1. Auth user ──────────────────────────────────────────────────────────
  -- Token fields must be empty strings (not NULL) for GoTrue to load the user
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    v_uid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'test@mybudget.local',
    crypt('TestPass123!', gen_salt('bf')),
    now(),
    '', '', '', '',
    now(), now(),
    '{"provider":"email","providers":["email"]}', '{}'
  ) ON CONFLICT (id) DO NOTHING;

  -- Identity row required for email/password login
  -- GoTrue v2: provider_id for email auth must be the email address, not the UUID
  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    'test@mybudget.local',
    v_uid,
    jsonb_build_object(
      'sub',            v_uid::text,
      'email',          'test@mybudget.local',
      'email_verified', false,
      'phone_verified', false
    ),
    'email',
    now(), now(), now()
  ) ON CONFLICT DO NOTHING;

  -- ── 2. Complete onboarding so the app skips the onboarding wizard ─────────
  UPDATE public.profiles
  SET currency              = 'USD',
      display_name          = 'Test User',
      onboarding_step       = 3,
      onboarding_completed_at = now()
  WHERE user_id = v_uid;

  -- ── 3. Accounts ───────────────────────────────────────────────────────────
  INSERT INTO public.accounts (id, user_id, name, type, actual_balance_minor, currency)
  VALUES
    (v_bank,    v_uid, 'Everyday Bank',      'bank',    0, 'USD'),
    (v_savings, v_uid, 'Emergency Savings',  'savings', 0, 'USD'),
    (v_cash,    v_uid, 'Cash Wallet',        'cash',    0, 'USD');

  -- ── 4. Resolve category IDs seeded by the on_auth_user_categories_seed trigger ──
  SELECT id INTO c_salary        FROM public.categories WHERE user_id = v_uid AND name = 'Salary';
  SELECT id INTO c_freelance     FROM public.categories WHERE user_id = v_uid AND name = 'Freelance';
  SELECT id INTO c_investment    FROM public.categories WHERE user_id = v_uid AND name = 'Investment';
  SELECT id INTO c_other_income  FROM public.categories WHERE user_id = v_uid AND name = 'Other Income';
  SELECT id INTO c_housing       FROM public.categories WHERE user_id = v_uid AND name = 'Housing';
  SELECT id INTO c_groceries     FROM public.categories WHERE user_id = v_uid AND name = 'Groceries';
  SELECT id INTO c_dining        FROM public.categories WHERE user_id = v_uid AND name = 'Dining Out';
  SELECT id INTO c_transport     FROM public.categories WHERE user_id = v_uid AND name = 'Transport';
  SELECT id INTO c_utilities     FROM public.categories WHERE user_id = v_uid AND name = 'Utilities';
  SELECT id INTO c_healthcare    FROM public.categories WHERE user_id = v_uid AND name = 'Healthcare';
  SELECT id INTO c_entertainment FROM public.categories WHERE user_id = v_uid AND name = 'Entertainment';
  SELECT id INTO c_shopping      FROM public.categories WHERE user_id = v_uid AND name = 'Shopping';
  SELECT id INTO c_education     FROM public.categories WHERE user_id = v_uid AND name = 'Education';
  SELECT id INTO c_other         FROM public.categories WHERE user_id = v_uid AND name = 'Other';

  -- ── 5. Budgets ────────────────────────────────────────────────────────────
  -- 5a. Monthly Groceries — single category
  INSERT INTO public.budgets (id, user_id, name, limit_minor, period_type)
  VALUES (b_groceries, v_uid, 'Monthly Groceries', 60000, 'monthly');
  INSERT INTO public.budget_categories (budget_id, category_id) VALUES (b_groceries, c_groceries);

  -- 5b. Monthly Transport — single category
  INSERT INTO public.budgets (id, user_id, name, limit_minor, period_type)
  VALUES (b_transport, v_uid, 'Transport Budget', 30000, 'monthly');
  INSERT INTO public.budget_categories (budget_id, category_id) VALUES (b_transport, c_transport);

  -- 5c. Entertainment & Shopping — multi-category
  INSERT INTO public.budgets (id, user_id, name, limit_minor, period_type)
  VALUES (b_ent_shopping, v_uid, 'Entertainment & Shopping', 60000, 'monthly');
  INSERT INTO public.budget_categories (budget_id, category_id)
  VALUES (b_ent_shopping, c_entertainment), (b_ent_shopping, c_shopping);

  -- 5d. Weekly Dining — weekly budget (no dates required)
  INSERT INTO public.budgets (id, user_id, name, limit_minor, period_type)
  VALUES (b_weekly_dining, v_uid, 'Weekly Dining', 15000, 'weekly');
  INSERT INTO public.budget_categories (budget_id, category_id) VALUES (b_weekly_dining, c_dining);

  -- 5e. Q2 Education — custom date range (April–June 2026)
  INSERT INTO public.budgets (id, user_id, name, limit_minor, period_type, period_start, period_end)
  VALUES (b_q2_education, v_uid, 'Q2 Education Fund', 120000, 'custom', '2026-04-01', '2026-06-30');
  INSERT INTO public.budget_categories (budget_id, category_id) VALUES (b_q2_education, c_education);

  -- 5f. Monthly Utilities — single category
  INSERT INTO public.budgets (id, user_id, name, limit_minor, period_type)
  VALUES (b_utilities, v_uid, 'Utilities', 30000, 'monthly');
  INSERT INTO public.budget_categories (budget_id, category_id) VALUES (b_utilities, c_utilities);

  -- ── 6. Goals ──────────────────────────────────────────────────────────────
  INSERT INTO public.goals (id, user_id, name, target_minor)
  VALUES
    (g_emergency,   v_uid, 'Emergency Fund',     1500000),  -- $15,000
    (g_laptop,      v_uid, 'New Laptop',           200000),  -- $2,000
    (g_vacation,    v_uid, 'Vacation Fund',        500000),  -- $5,000
    (g_downpayment, v_uid, 'Home Down Payment',  5000000);  -- $50,000

  -- ── 7. Goal contributions ─────────────────────────────────────────────────
  INSERT INTO public.goal_contributions (goal_id, user_id, amount_minor, date)
  VALUES
    -- Emergency Fund: two contributions
    (g_emergency,   v_uid,  50000, '2026-06-01'),
    (g_emergency,   v_uid,  50000, '2026-06-15'),
    -- New Laptop: two contributions
    (g_laptop,      v_uid,  30000, '2026-06-10'),
    (g_laptop,      v_uid,  30000, '2026-06-25'),
    -- Vacation Fund: three contributions
    (g_vacation,    v_uid,  20000, '2026-06-05'),
    (g_vacation,    v_uid,  20000, '2026-06-20'),
    (g_vacation,    v_uid,  20000, '2026-06-28'),
    -- Home Down Payment: single large contribution
    (g_downpayment, v_uid, 100000, '2026-06-01');

  -- ── 8. Macros ─────────────────────────────────────────────────────────────
  -- Account-targeted macros (3)
  INSERT INTO public.macros (user_id, name, amount_minor, account_id, category_id)
  VALUES
    (v_uid, 'Netflix',         1599, v_bank, c_entertainment),
    (v_uid, 'Gym Membership',  4500, v_bank, c_healthcare),
    (v_uid, 'Monthly Bus Pass', 8000, v_bank, c_transport);

  -- Goal-targeted macros (3) — category_id required but used for UI label only
  INSERT INTO public.macros (user_id, name, amount_minor, goal_id, category_id)
  VALUES
    (v_uid, 'Vacation Save',  20000, g_vacation,    c_other),
    (v_uid, 'Laptop Fund',    15000, g_laptop,      c_other),
    (v_uid, 'Emergency Save', 50000, g_emergency,   c_other);

  -- ── 9. Transactions (~52 total) ───────────────────────────────────────────
  -- Direct inserts as superuser; balance recalculated in step 11.
  -- type = category.type ('income' or 'expense').

  INSERT INTO public.transactions (user_id, account_id, category_id, amount_minor, date, note, type)
  VALUES
    -- ── Income ──────────────────────────────────────────────────────────────
    (v_uid, v_bank,    c_salary,       450000, '2026-06-01', 'June salary',            'income'),
    (v_uid, v_savings, c_salary,        50000, '2026-06-01', 'June savings allocation', 'income'),
    (v_uid, v_bank,    c_freelance,     80000, '2026-06-10', 'Website redesign',       'income'),
    (v_uid, v_savings, c_investment,    25000, '2026-06-15', 'Dividend payment',       'income'),
    (v_uid, v_bank,    c_freelance,     35000, '2026-06-18', 'Logo design project',    'income'),
    (v_uid, v_cash,    c_other_income,  10000, '2026-06-25', 'Sold old items',         'income'),
    (v_uid, v_savings, c_investment,    18000, '2026-06-28', 'ETF dividend',           'income'),
    (v_uid, v_bank,    c_freelance,     22000, '2026-06-20', 'Copy editing gig',       'income'),

    -- ── Housing ─────────────────────────────────────────────────────────────
    (v_uid, v_bank, c_housing, 150000, '2026-06-01', 'June rent',       'expense'),
    (v_uid, v_bank, c_housing,  15000, '2026-06-08', 'Home insurance',  'expense'),

    -- ── Groceries (7 — spread across bank + cash) ───────────────────────────
    (v_uid, v_bank, c_groceries,  8500, '2026-06-02', 'Weekly groceries – Lidl',  'expense'),
    (v_uid, v_bank, c_groceries,  9200, '2026-06-07', 'Weekend shop',             'expense'),
    (v_uid, v_bank, c_groceries,  7800, '2026-06-13', 'Midweek top-up',           'expense'),
    (v_uid, v_bank, c_groceries, 11000, '2026-06-18', 'Big weekly shop',          'expense'),
    (v_uid, v_bank, c_groceries,  9500, '2026-06-24', 'Weekly groceries',         'expense'),
    (v_uid, v_cash, c_groceries,  6700, '2026-06-17', 'Farmer''s market',         'expense'),
    (v_uid, v_bank, c_groceries,  5500, '2026-06-29', 'End of month top-up',      'expense'),

    -- ── Dining Out (6 — bank + cash) ────────────────────────────────────────
    (v_uid, v_bank, c_dining, 4200, '2026-06-04', 'Dinner with friends',  'expense'),
    (v_uid, v_bank, c_dining, 2850, '2026-06-10', 'Lunch meeting',        'expense'),
    (v_uid, v_bank, c_dining, 5500, '2026-06-15', 'Anniversary dinner',   'expense'),
    (v_uid, v_bank, c_dining, 3800, '2026-06-21', 'Weekend brunch',       'expense'),
    (v_uid, v_cash, c_dining, 2200, '2026-06-28', 'Street food lunch',    'expense'),
    (v_uid, v_cash, c_dining, 1800, '2026-06-26', 'Coffee and pastries',  'expense'),

    -- ── Transport (5 — bank + cash) ─────────────────────────────────────────
    (v_uid, v_cash, c_transport, 2500, '2026-06-03', 'Taxi',              'expense'),
    (v_uid, v_bank, c_transport, 8000, '2026-06-08', 'Monthly bus pass',  'expense'),
    (v_uid, v_bank, c_transport, 4500, '2026-06-17', 'Uber rides',        'expense'),
    (v_uid, v_cash, c_transport, 1500, '2026-06-25', 'Bus fares',         'expense'),
    (v_uid, v_bank, c_transport, 3500, '2026-06-11', 'Train tickets',     'expense'),

    -- ── Utilities (3) ───────────────────────────────────────────────────────
    (v_uid, v_bank, c_utilities, 12000, '2026-06-06', 'Electricity bill', 'expense'),
    (v_uid, v_bank, c_utilities,  8500, '2026-06-23', 'Internet bill',    'expense'),
    (v_uid, v_bank, c_utilities,  5500, '2026-06-20', 'Water bill',       'expense'),

    -- ── Healthcare (4 — bank + cash) ────────────────────────────────────────
    (v_uid, v_bank, c_healthcare, 4500, '2026-06-09', 'Gym membership',   'expense'),
    (v_uid, v_cash, c_healthcare, 3500, '2026-06-16', 'Pharmacy',         'expense'),
    (v_uid, v_bank, c_healthcare, 8500, '2026-06-22', 'Eye exam',         'expense'),
    (v_uid, v_bank, c_healthcare,12000, '2026-06-27', 'Dental checkup',   'expense'),

    -- ── Entertainment (4) ───────────────────────────────────────────────────
    (v_uid, v_bank, c_entertainment, 1599, '2026-06-05', 'Netflix subscription', 'expense'),
    (v_uid, v_bank, c_entertainment,  999, '2026-06-14', 'Spotify',              'expense'),
    (v_uid, v_bank, c_entertainment, 2999, '2026-06-20', 'Video game',           'expense'),
    (v_uid, v_bank, c_entertainment, 1250, '2026-06-29', 'Movie tickets',        'expense'),

    -- ── Shopping (4) ────────────────────────────────────────────────────────
    (v_uid, v_bank, c_shopping, 14500, '2026-06-11', 'New shoes',        'expense'),
    (v_uid, v_bank, c_shopping, 21000, '2026-06-22', 'Summer clothes',   'expense'),
    (v_uid, v_bank, c_shopping,  8800, '2026-06-14', 'Kitchen supplies', 'expense'),
    (v_uid, v_bank, c_shopping,  5500, '2026-06-30', 'Amazon order',     'expense'),

    -- ── Education (3) ───────────────────────────────────────────────────────
    (v_uid, v_bank, c_education,  8900, '2026-06-12', 'Online course',         'expense'),
    (v_uid, v_bank, c_education, 29900, '2026-06-26', 'Conference ticket',     'expense'),
    (v_uid, v_bank, c_education,  4500, '2026-06-19', 'Technical book',        'expense'),

    -- ── Other (4 — bank + cash) ─────────────────────────────────────────────
    (v_uid, v_bank, c_other, 6500, '2026-06-19', 'Haircut and tip',    'expense'),
    (v_uid, v_bank, c_other, 4500, '2026-06-30', 'Monthly parking',    'expense'),
    (v_uid, v_cash, c_other, 2800, '2026-06-25', 'Post office fees',   'expense'),
    (v_uid, v_bank, c_other, 3500, '2026-06-07', 'Phone screen repair','expense');

  -- ── 10. Transfers ─────────────────────────────────────────────────────────
  -- Internal transfers: both accounts explicitly set, type='internal'
  INSERT INTO public.transfers (user_id, type, from_account_id, to_account_id, amount_minor, date, note)
  VALUES
    (v_uid, 'internal', v_bank,    v_savings, 50000, '2026-06-01', 'Monthly savings transfer'),
    (v_uid, 'internal', v_savings, v_bank,    20000, '2026-06-20', 'Top up checking');

  -- External transfers: one-sided — use from_account_id for outflow, to_account_id for inflow
  INSERT INTO public.transfers (user_id, type, from_account_id, to_account_id, amount_minor, date, note)
  VALUES
    -- Cash: external inflow (ATM withdrawal tops up cash wallet)
    (v_uid, 'external', NULL,      v_cash,    20000, '2026-06-10', 'ATM cash withdrawal'),
    -- Bank: external outflow (bank fee)
    (v_uid, 'external', v_bank,    NULL,       5000, '2026-06-15', 'Bank service fee'),
    -- Savings: external inflow (cashback reward)
    (v_uid, 'external', NULL,      v_savings, 10000, '2026-06-27', 'Credit card cashback');

  -- ── 11. Recalculate account balances ─────────────────────────────────────
  -- Sum all active transactions + transfer movements for each account.
  UPDATE public.accounts a
  SET actual_balance_minor = (
      -- Income transactions increase balance; expense transactions decrease it
      SELECT COALESCE(SUM(
        CASE WHEN t.type = 'income' THEN t.amount_minor ELSE -t.amount_minor END
      ), 0)
      FROM public.transactions t
      WHERE t.account_id = a.id
        AND t.archived_at IS NULL
    ) + (
      -- Transfers INTO this account (internal to_account_id OR external to_account_id)
      SELECT COALESCE(SUM(tr.amount_minor), 0)
      FROM public.transfers tr
      WHERE tr.to_account_id = a.id
    ) - (
      -- Transfers OUT of this account (internal from_account_id OR external from_account_id)
      SELECT COALESCE(SUM(tr.amount_minor), 0)
      FROM public.transfers tr
      WHERE tr.from_account_id = a.id
    )
  WHERE a.user_id = v_uid;

  RAISE NOTICE '✓ June 2026 seed complete — user: test@mybudget.local';
  RAISE NOTICE '  Accounts: Everyday Bank, Emergency Savings, Cash Wallet';
  RAISE NOTICE '  Budgets: 6 (monthly/weekly/custom, single/multi-category)';
  RAISE NOTICE '  Goals: 4  |  Macros: 6  |  Transactions: 50  |  Transfers: 5';

END $$;
