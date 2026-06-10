-- pgTAP tests for budget_threshold_events: threshold logic and RLS (Story 4.2)
-- Owner UUID:   55555555-5555-4555-8555-555555555555
-- Attacker UUID: 66666666-6666-4666-8666-666666666666

BEGIN;

SELECT plan(9);

-- ── Setup: auth users, account, category 1, budget 1 (monthly @ 90%) ─────────

DO $setup$
DECLARE
  v_owner   uuid := '55555555-5555-4555-8555-555555555555';
  v_att     uuid := '66666666-6666-4666-8666-666666666666';
  v_account uuid := '55555555-5555-4555-8555-000000000001';
  v_cat1    uuid := '55555555-5555-4555-8555-000000000002';
  v_budget1 uuid := '55555555-5555-4555-8555-000000000010';
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) VALUES
    (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'threshold_owner@test.local', 'x', now(), now(), now(), '{}', '{}'),
    (v_att,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'threshold_attacker@test.local', 'x', now(), now(), now(), '{}', '{}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.accounts (id, user_id, name, type, actual_balance_minor, currency)
  VALUES (v_account, v_owner, 'Threshold Test Bank', 'bank', 1000000, 'USD')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.categories (id, user_id, name, type)
  VALUES (v_cat1, v_owner, 'Threshold Test Groceries', 'expense')
  ON CONFLICT DO NOTHING;

  -- Monthly budget, limit = $100 (10000 minor units)
  INSERT INTO public.budgets (id, user_id, name, limit_minor, period_type)
  VALUES (v_budget1, v_owner, 'Monthly Groceries Budget', 10000, 'monthly')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.budget_categories (budget_id, category_id)
  VALUES (v_budget1, v_cat1)
  ON CONFLICT DO NOTHING;

  -- Expense transaction: 9000 minor = 90% of 10000 limit (current month)
  INSERT INTO public.transactions (user_id, account_id, category_id, amount_minor, type, date)
  VALUES (v_owner, v_account, v_cat1, 9000, 'expense', CURRENT_DATE)
  ON CONFLICT DO NOTHING;
END $setup$;

-- ── Test 1: Anti-vacuous — owner has exactly 1 budget ────────────────────────

SELECT is(
  (SELECT COUNT(*)::int FROM public.budgets WHERE user_id = '55555555-5555-4555-8555-555555555555'),
  1,
  'Anti-vacuous: owner has 1 budget seeded before threshold tests'
);

-- ── Test 2: Event fires when budget actual >= 80% ────────────────────────────

SELECT public.rpc_check_budget_thresholds();

SELECT is(
  (SELECT COUNT(*)::int FROM public.budget_threshold_events
   WHERE budget_id = '55555555-5555-4555-8555-000000000010'),
  1,
  'Threshold event fires exactly once for a budget at 90%'
);

-- ── Test 3: Calling the function again does NOT add a second event ────────────

SELECT public.rpc_check_budget_thresholds();

SELECT is(
  (SELECT COUNT(*)::int FROM public.budget_threshold_events
   WHERE budget_id = '55555555-5555-4555-8555-000000000010'),
  1,
  'ON CONFLICT guard: second call in same period still produces only 1 event'
);

-- ── Setup: Budget 2 at 50% (below threshold) ─────────────────────────────────

DO $$
DECLARE
  v_owner   uuid := '55555555-5555-4555-8555-555555555555';
  v_account uuid := '55555555-5555-4555-8555-000000000001';
  v_cat2    uuid := '55555555-5555-4555-8555-000000000003';
  v_budget2 uuid := '55555555-5555-4555-8555-000000000011';
BEGIN
  INSERT INTO public.categories (id, user_id, name, type)
  VALUES (v_cat2, v_owner, 'Threshold Test Entertainment', 'expense')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.budgets (id, user_id, name, limit_minor, period_type)
  VALUES (v_budget2, v_owner, 'Monthly Entertainment Budget', 10000, 'monthly')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.budget_categories (budget_id, category_id)
  VALUES (v_budget2, v_cat2)
  ON CONFLICT DO NOTHING;

  -- 5000 = 50% of 10000 — must NOT fire threshold
  INSERT INTO public.transactions (user_id, account_id, category_id, amount_minor, type, date)
  VALUES (v_owner, v_account, v_cat2, 5000, 'expense', CURRENT_DATE)
  ON CONFLICT DO NOTHING;
END $$;

-- ── Test 4: Budget at 50% does not fire a threshold event ────────────────────

SELECT public.rpc_check_budget_thresholds();

SELECT is(
  (SELECT COUNT(*)::int FROM public.budget_threshold_events
   WHERE budget_id = '55555555-5555-4555-8555-000000000011'),
  0,
  'Budget at 50% does not fire a threshold event'
);

-- ── Setup: Budget 3 — expired custom-period ───────────────────────────────────

DO $$
DECLARE
  v_owner   uuid := '55555555-5555-4555-8555-555555555555';
  v_account uuid := '55555555-5555-4555-8555-000000000001';
  v_cat3    uuid := '55555555-5555-4555-8555-000000000004';
  v_budget3 uuid := '55555555-5555-4555-8555-000000000012';
BEGIN
  INSERT INTO public.categories (id, user_id, name, type)
  VALUES (v_cat3, v_owner, 'Threshold Test Dining', 'expense')
  ON CONFLICT DO NOTHING;

  -- Custom period: ended yesterday — today is OUTSIDE the period
  INSERT INTO public.budgets (id, user_id, name, limit_minor, period_type, period_start, period_end)
  VALUES (v_budget3, v_owner, 'Expired Custom Budget', 10000, 'custom',
          CURRENT_DATE - 30, CURRENT_DATE - 1)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.budget_categories (budget_id, category_id)
  VALUES (v_budget3, v_cat3)
  ON CONFLICT DO NOTHING;

  -- 9000 within the expired period — the sweep skips this budget entirely
  INSERT INTO public.transactions (user_id, account_id, category_id, amount_minor, type, date)
  VALUES (v_owner, v_account, v_cat3, 9000, 'expense', CURRENT_DATE - 1)
  ON CONFLICT DO NOTHING;
END $$;

-- ── Test 5: Expired custom-period budget is skipped (no event) ───────────────

SELECT public.rpc_check_budget_thresholds();

SELECT is(
  (SELECT COUNT(*)::int FROM public.budget_threshold_events
   WHERE budget_id = '55555555-5555-4555-8555-000000000012'),
  0,
  'Expired custom-period budget is skipped — no threshold event fired'
);

-- ── Test 6: RLS — attacker cannot see owner threshold events ─────────────────

SET LOCAL "request.jwt.claims" TO '{"sub": "66666666-6666-4666-8666-666666666666"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM public.budget_threshold_events
   WHERE budget_id = '55555555-5555-4555-8555-000000000010'),
  0,
  'RLS: attacker sees 0 rows for owner''s threshold events'
);

SET LOCAL ROLE postgres;

-- ── Test 7: processed_at is NULL for a newly fired event ─────────────────────

SELECT ok(
  (SELECT processed_at IS NULL
   FROM public.budget_threshold_events
   WHERE budget_id = '55555555-5555-4555-8555-000000000010'),
  'Newly fired threshold event has processed_at = NULL (not yet processed by E9)'
);

-- ── Test 8: UNIQUE constraint prevents duplicate direct INSERT ────────────────

SELECT throws_ok(
  $$INSERT INTO public.budget_threshold_events (budget_id, user_id, period_start, period_end, pct_used, actual_minor)
    SELECT budget_id, user_id, period_start, period_end, 90.00, 9000
    FROM public.budget_threshold_events
    WHERE budget_id = '55555555-5555-4555-8555-000000000010'
    LIMIT 1$$,
  '23505',
  NULL::text,
  'UNIQUE constraint rejects duplicate (budget_id, period_start, period_end) insert'
);

-- ── Test 9: Authenticated role cannot INSERT directly (REVOKE verified) ──────

SET LOCAL "request.jwt.claims" TO '{"sub": "55555555-5555-4555-8555-555555555555"}';
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$INSERT INTO public.budget_threshold_events
      (budget_id, user_id, period_start, period_end, pct_used, actual_minor)
    VALUES (
      '55555555-5555-4555-8555-000000000010',
      '55555555-5555-4555-8555-555555555555',
      CURRENT_DATE,
      CURRENT_DATE + 1,
      50.00,
      5000
    )$$,
  '42501',
  NULL::text,
  'REVOKE INSERT: authenticated role cannot directly insert into budget_threshold_events'
);

SET LOCAL ROLE postgres;

SELECT * FROM finish();
ROLLBACK;
