-- pgTAP tests for Phase 2 Task 4: Concurrency, idempotency & data integrity
--
-- UUID block: 11111111-a004-4000-8000-*
--   alice:        11111111-a004-4000-8000-000000000001
--   bob:          11111111-a004-4000-8000-000000000002
--   family_unit:  11111111-a004-4000-8000-000000000010
--   alice_acct:   11111111-a004-4000-8000-000000000020
--   bob_acct:     11111111-a004-4000-8000-000000000021
--   tx_shared:    11111111-a004-4000-8000-000000000030 (shared, amount=1000, split 500+500)
--   tx_no_split:  11111111-a004-4000-8000-000000000031 (shared, no split row yet)
--   goal_active:  11111111-a004-4000-8000-000000000040
--   goal_archived:11111111-a004-4000-8000-000000000041

BEGIN;

SELECT plan(16);

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed (as postgres — bypasses RLS)
-- ──────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-a004-4000-8000-000000000001', 'alice-a004@test.com', '{}'),
  ('11111111-a004-4000-8000-000000000002', 'bob-a004@test.com',   '{}');

SELECT public.seed_default_categories('11111111-a004-4000-8000-000000000001');
SELECT public.seed_default_categories('11111111-a004-4000-8000-000000000002');

INSERT INTO public.accounts (id, user_id, name, type, currency, actual_balance_minor)
VALUES
  ('11111111-a004-4000-8000-000000000020', '11111111-a004-4000-8000-000000000001', 'Alice a004 Cash', 'cash', 'USD', 50000),
  ('11111111-a004-4000-8000-000000000021', '11111111-a004-4000-8000-000000000002', 'Bob a004 Cash',   'cash', 'USD', 50000);

INSERT INTO public.family_units (id) VALUES ('11111111-a004-4000-8000-000000000010');

INSERT INTO public.family_members (family_unit_id, user_id, join_date, joined_at)
VALUES
  ('11111111-a004-4000-8000-000000000010', '11111111-a004-4000-8000-000000000001', '2026-01-01', '2026-01-01 10:00:00'),
  ('11111111-a004-4000-8000-000000000010', '11111111-a004-4000-8000-000000000002', '2026-01-01', '2026-01-01 10:00:00');

-- tx_shared: alice's shared expense, amount=1000, with an existing equal split
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-a004-4000-8000-000000000030',
  '11111111-a004-4000-8000-000000000001',
  '11111111-a004-4000-8000-000000000020',
  (SELECT id FROM public.categories WHERE user_id = '11111111-a004-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  1000, '2026-04-01', 'expense', true;

INSERT INTO public.transaction_splits
  (transaction_id, payer_id, payer_share_minor, partner_share_minor, split_method)
VALUES
  ('11111111-a004-4000-8000-000000000030',
   '11111111-a004-4000-8000-000000000001',
   500, 500, 'equal');

-- tx_no_split: alice's shared expense, no split row — for testing reclassify trail with no split
INSERT INTO public.transactions
  (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
SELECT
  '11111111-a004-4000-8000-000000000031',
  '11111111-a004-4000-8000-000000000001',
  '11111111-a004-4000-8000-000000000020',
  (SELECT id FROM public.categories WHERE user_id = '11111111-a004-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  600, '2026-04-02', 'expense', true;

-- Shared goals for contribution analysis (4f)
INSERT INTO public.goals (id, user_id, name, target_minor, is_shared)
VALUES
  ('11111111-a004-4000-8000-000000000040', '11111111-a004-4000-8000-000000000001', 'Active Goal a004',   100000, true),
  ('11111111-a004-4000-8000-000000000041', '11111111-a004-4000-8000-000000000001', 'Archived Goal a004', 200000, true);

-- Archive the archived goal
UPDATE public.goals
   SET archived_at = now() - interval '1 day'
 WHERE id = '11111111-a004-4000-8000-000000000041';

-- Contributions: 300 to active goal, 700 to archived goal — both from alice
INSERT INTO public.goal_contributions (goal_id, user_id, amount_minor, date)
VALUES
  ('11111111-a004-4000-8000-000000000040', '11111111-a004-4000-8000-000000000001', 300, '2026-04-01'),
  ('11111111-a004-4000-8000-000000000041', '11111111-a004-4000-8000-000000000001', 700, '2026-04-01');

-- ──────────────────────────────────────────────────────────────────────────────
-- T1: transaction_splits.updated_at column exists (added in 4b)
-- ──────────────────────────────────────────────────────────────────────────────
SELECT has_column(
  'public',
  'transaction_splits',
  'updated_at',
  'T1: transaction_splits.updated_at column exists'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T2: idx_notif_month_end unique index exists (added in 4a)
-- ──────────────────────────────────────────────────────────────────────────────
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'notifications'
       AND indexname  = 'idx_notif_month_end'
  ),
  'T2: idx_notif_month_end unique index exists on notifications'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T3: rpc_edit_transaction auto-rebalances split when amount changes (4b)
-- Amount changes from 1000 → 1100; new equal split = 550 + 550.
-- ──────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-a004-4000-8000-000000000001"}';

SELECT lives_ok(
  $$ SELECT public.rpc_edit_transaction(
       '11111111-a004-4000-8000-000000000030'::uuid,  -- tx_shared
       '11111111-a004-4000-8000-000000000020'::uuid,  -- same account
       (SELECT category_id FROM public.transactions WHERE id = '11111111-a004-4000-8000-000000000030'),
       1100::bigint,                                   -- new amount (was 1000)
       '2026-04-01'::date,
       null::text, null::uuid
     ) $$,
  'T3-pre: rpc_edit_transaction with changed amount completes without error'
);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT payer_share_minor FROM public.transaction_splits WHERE transaction_id = '11111111-a004-4000-8000-000000000030'),
  550::bigint,
  'T3: payer_share_minor rebalanced to 550 (half of new 1100)'
);

SELECT is(
  (SELECT partner_share_minor FROM public.transaction_splits WHERE transaction_id = '11111111-a004-4000-8000-000000000030'),
  550::bigint,
  'T3b: partner_share_minor rebalanced to 550 (half of new 1100)'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T4: rpc_edit_transaction does NOT touch split when amount is unchanged (4b)
-- ──────────────────────────────────────────────────────────────────────────────
-- Manually set an asymmetric split to detect unwanted mutation
UPDATE public.transaction_splits
   SET payer_share_minor   = 800,
       partner_share_minor = 300,
       split_method        = 'fixed'
 WHERE transaction_id = '11111111-a004-4000-8000-000000000030';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-a004-4000-8000-000000000001"}';

SELECT lives_ok(
  $$ SELECT public.rpc_edit_transaction(
       '11111111-a004-4000-8000-000000000030'::uuid,
       '11111111-a004-4000-8000-000000000020'::uuid,
       (SELECT category_id FROM public.transactions WHERE id = '11111111-a004-4000-8000-000000000030'),
       1100::bigint,  -- same as post-T3 amount (unchanged)
       '2026-04-01'::date,
       'note-updated'::text, null::uuid
     ) $$,
  'T4-pre: rpc_edit_transaction with unchanged amount completes without error'
);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT payer_share_minor FROM public.transaction_splits WHERE transaction_id = '11111111-a004-4000-8000-000000000030'),
  800::bigint,
  'T4: payer_share_minor untouched (800) when amount unchanged'
);

SELECT is(
  (SELECT partner_share_minor FROM public.transaction_splits WHERE transaction_id = '11111111-a004-4000-8000-000000000030'),
  300::bigint,
  'T4b: partner_share_minor untouched (300) when amount unchanged'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T5: rpc_reclassify_transaction Shared→Personal captures split_deleted in trail (4b)
-- ──────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-a004-4000-8000-000000000001"}';

SELECT lives_ok(
  $$ SELECT public.rpc_reclassify_transaction(
       '11111111-a004-4000-8000-000000000030'::uuid, false
     ) $$,
  'T5-pre: reclassify Shared→Personal (tx_shared has a split) completes without error'
);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT changed_fields ? 'split_deleted' FROM public.activity_trail
    WHERE transaction_id = '11111111-a004-4000-8000-000000000030'
      AND change_type    = 'reclassified_to_personal'
    LIMIT 1),
  true,
  'T5: activity_trail has split_deleted field when split existed before Shared→Personal'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T6: rpc_reclassify_transaction Shared→Personal with no split: trail has no split_deleted (4b)
-- ──────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-a004-4000-8000-000000000001"}';

SELECT lives_ok(
  $$ SELECT public.rpc_reclassify_transaction(
       '11111111-a004-4000-8000-000000000031'::uuid, false
     ) $$,
  'T6-pre: reclassify Shared→Personal (tx_no_split has no split row) completes without error'
);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT changed_fields ? 'split_deleted' FROM public.activity_trail
    WHERE transaction_id = '11111111-a004-4000-8000-000000000031'
      AND change_type    = 'reclassified_to_personal'
    LIMIT 1),
  false,
  'T6: split_deleted NOT present in trail when no split existed on Shared→Personal'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T7: rpc_close_month_adjustments inserts multiple adjustments atomically (4c)
-- ──────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-a004-4000-8000-000000000001"}';

SELECT is(
  (SELECT public.rpc_close_month_adjustments(
     '11111111-a004-4000-8000-000000000010'::uuid,
     '[
       {"account_id":"11111111-a004-4000-8000-000000000020","delta_minor":100,"note":"adj1"},
       {"account_id":"11111111-a004-4000-8000-000000000020","delta_minor":-50,"note":"adj2"},
       {"account_id":"11111111-a004-4000-8000-000000000020","delta_minor":0,"note":"skip-zero"}
     ]'::jsonb
   )),
  2,
  'T7: rpc_close_month_adjustments returns 2 (skips zero-delta entry)'
);

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT count(*)::int FROM public.reconciliation_adjustments
    WHERE family_unit_id = '11111111-a004-4000-8000-000000000010'),
  2,
  'T7b: two adjustment rows inserted; zero-delta entry skipped'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T8: rpc_get_contribution_analysis excludes archived shared goal contributions (4f)
-- Expected: alice's goal_contribution_minor = 300 (active goal only, not +700 from archived)
-- ──────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-a004-4000-8000-000000000001"}';

SELECT is(
  (SELECT goal_contribution_minor::bigint
     FROM public.rpc_get_contribution_analysis(null, null)
    WHERE contributor_id = '11111111-a004-4000-8000-000000000001'),
  300::bigint,
  'T8: rpc_get_contribution_analysis excludes archived goal contributions (300, not 1000)'
);

SET LOCAL ROLE postgres;

-- ──────────────────────────────────────────────────────────────────────────────
-- T9: rpc_process_budget_threshold_notifications skips events with $0 limit (4f)
-- ──────────────────────────────────────────────────────────────────────────────

-- We need a budget owned by alice with a threshold event that has budget_limit_minor = 0
INSERT INTO public.budgets
  (id, user_id, name, limit_minor, period_type)
VALUES
  ('11111111-a004-4000-8000-000000000050',
   '11111111-a004-4000-8000-000000000001',
   'Zero-limit budget a004',
   5000, 'monthly');

-- Simulate a pre-0042 stale event with budget_limit_minor = 0
INSERT INTO public.budget_threshold_events
  (budget_id, user_id, pct_used, actual_minor, budget_limit_minor, period_start, period_end, processed_at)
VALUES
  ('11111111-a004-4000-8000-000000000050',
   '11111111-a004-4000-8000-000000000001',
   75.0, 3750, 0,  -- budget_limit_minor = 0 (stale default)
   date_trunc('month', CURRENT_DATE)::date,
   (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date,
   NULL);

-- Fire the processor (runs as postgres/SECURITY DEFINER)
SELECT public.rpc_process_budget_threshold_notifications();

SELECT is(
  (SELECT count(*)::bigint FROM public.notifications
    WHERE user_id = '11111111-a004-4000-8000-000000000001'
      AND type    = 'budget_threshold'),
  0::bigint,
  'T9: $0 budget_limit_minor event is skipped — no budget_threshold notification created'
);

SELECT * FROM finish();
ROLLBACK;
