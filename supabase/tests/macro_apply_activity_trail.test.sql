-- pgTAP tests: macro_apply activity trail (Task 10 / 0062)
--
-- UUID block 11111111-2012-* (Phase 2 Task 10, macro trail):
--   owner    : 11111111-2012-4000-8000-000000000001
--   account  : 11111111-2012-4000-8000-000000000010
--   category : 11111111-2012-4000-8000-000000000011
--   macro    : 11111111-2012-4000-8000-000000000012
--   goal     : 11111111-2012-4000-8000-000000000013
--   goal macro: 11111111-2012-4000-8000-000000000014

BEGIN;

SELECT plan(5);

-- ── Setup ──────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email) VALUES
  ('11111111-2012-4000-8000-000000000001', 'owner_macro_trail@test.local')
ON CONFLICT (id) DO NOTHING;

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-2012-4000-8000-000000000001"}';

INSERT INTO public.accounts (id, user_id, name, type, actual_balance_minor)
VALUES ('11111111-2012-4000-8000-000000000010', '11111111-2012-4000-8000-000000000001', 'Checking', 'bank', 50000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.categories (id, user_id, name, type)
VALUES ('11111111-2012-4000-8000-000000000011', '11111111-2012-4000-8000-000000000001', 'Rent', 'expense')
ON CONFLICT (id) DO NOTHING;

-- Account-targeted macro
INSERT INTO public.macros (id, user_id, name, amount_minor, account_id, goal_id, category_id)
VALUES (
  '11111111-2012-4000-8000-000000000012',
  '11111111-2012-4000-8000-000000000001',
  'Monthly Rent',
  1000,
  '11111111-2012-4000-8000-000000000010',
  NULL,
  '11111111-2012-4000-8000-000000000011'
)
ON CONFLICT (id) DO NOTHING;

-- Goal-targeted macro
INSERT INTO public.goals (id, user_id, name, target_minor)
VALUES ('11111111-2012-4000-8000-000000000013', '11111111-2012-4000-8000-000000000001', 'Savings', 5000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.macros (id, user_id, name, amount_minor, account_id, goal_id, category_id)
VALUES (
  '11111111-2012-4000-8000-000000000014',
  '11111111-2012-4000-8000-000000000001',
  'Savings Top-Up',
  500,
  NULL,
  '11111111-2012-4000-8000-000000000013',
  '11111111-2012-4000-8000-000000000011'
)
ON CONFLICT (id) DO NOTHING;

-- Apply the account-targeted macro; capture its application_id + transaction_id
CREATE TEMP TABLE t_acct_app (application_id UUID) ON COMMIT DROP;
INSERT INTO t_acct_app
  SELECT public.rpc_apply_macro('11111111-2012-4000-8000-000000000012'::UUID);

-- Apply the goal-targeted macro
CREATE TEMP TABLE t_goal_app (application_id UUID) ON COMMIT DROP;
INSERT INTO t_goal_app
  SELECT public.rpc_apply_macro('11111111-2012-4000-8000-000000000014'::UUID);

-- ── T1: Account macro apply creates a transaction ─────────────────────────────

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE macro_application_id = (SELECT application_id FROM t_acct_app)
     AND user_id = '11111111-2012-4000-8000-000000000001'),
  1,
  'T1: account-targeted macro apply creates exactly one transaction'
);

-- ── T2: Activity trail entry with change_type=macro_apply is created ──────────

SELECT is(
  (SELECT COUNT(*)::int FROM public.activity_trail at2
   JOIN public.transactions t ON t.id = at2.transaction_id
   WHERE t.macro_application_id = (SELECT application_id FROM t_acct_app)
     AND at2.change_type = 'macro_apply'
     AND at2.user_id = '11111111-2012-4000-8000-000000000001'),
  1,
  'T2: activity_trail entry with change_type=macro_apply is created for account macro'
);

-- ── T3: Trail entry transaction_id matches the created transaction ─────────────

SELECT is(
  (SELECT at2.transaction_id FROM public.activity_trail at2
   JOIN public.transactions t ON t.id = at2.transaction_id
   WHERE t.macro_application_id = (SELECT application_id FROM t_acct_app)
     AND at2.change_type = 'macro_apply'),
  (SELECT id FROM public.transactions
   WHERE macro_application_id = (SELECT application_id FROM t_acct_app)),
  'T3: trail entry transaction_id matches the created transaction'
);

-- ── T4: Goal-targeted macro does NOT create a transaction ─────────────────────

SELECT is(
  (SELECT COUNT(*)::int FROM public.transactions
   WHERE macro_application_id = (SELECT application_id FROM t_goal_app)),
  0,
  'T4: goal-targeted macro apply creates no transaction row'
);

-- ── T5: Goal-targeted macro does NOT create an activity_trail entry ───────────

SELECT is(
  (SELECT COUNT(*)::int FROM public.activity_trail
   WHERE user_id = '11111111-2012-4000-8000-000000000001'
     AND change_type = 'macro_apply'),
  -- only the account macro from T2 writes a trail entry; goal macro should not
  1,
  'T5: goal-targeted macro apply creates no additional activity_trail entry'
);

SELECT * FROM finish();
ROLLBACK;
