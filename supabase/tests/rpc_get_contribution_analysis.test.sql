-- pgTAP: rpc_get_contribution_analysis
-- Story 7.9: Contribution Analysis
--
-- UUID block: 11111111-7009-* (dev-learnings §22 convention)
--   alice  : 11111111-7009-4000-8000-000000000001
--   bob    : 11111111-7009-4000-8000-000000000002
--   carol  : 11111111-7009-4000-8000-000000000003 (stranger, no family)
--   family : 11111111-7009-4000-8000-000000000010
--   accounts: 11111111-7009-4000-8000-000000000011 (alice), ...12 (bob)
--   transactions: 11111111-7009-4000-8000-0000000000xx

BEGIN;
SELECT plan(19);

-- ── Seed users ───────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('11111111-7009-4000-8000-000000000001', 'alice-7009@example.com'),
  ('11111111-7009-4000-8000-000000000002', 'bob-7009@example.com'),
  ('11111111-7009-4000-8000-000000000003', 'carol-7009@example.com');

SELECT seed_default_categories('11111111-7009-4000-8000-000000000001');
SELECT seed_default_categories('11111111-7009-4000-8000-000000000002');
SELECT seed_default_categories('11111111-7009-4000-8000-000000000003');

-- ── Seed family ──────────────────────────────────────────────────────────────
INSERT INTO public.family_units (id)
  VALUES ('11111111-7009-4000-8000-000000000010');

INSERT INTO public.family_members (family_unit_id, user_id, join_date) VALUES
  ('11111111-7009-4000-8000-000000000010', '11111111-7009-4000-8000-000000000001', '2026-01-01'),
  ('11111111-7009-4000-8000-000000000010', '11111111-7009-4000-8000-000000000002', '2026-01-01');

-- ── Seed accounts ────────────────────────────────────────────────────────────
INSERT INTO public.accounts (id, user_id, name, type, actual_balance_minor) VALUES
  ('11111111-7009-4000-8000-000000000011', '11111111-7009-4000-8000-000000000001', 'Alice Bank', 'bank', 0),
  ('11111111-7009-4000-8000-000000000012', '11111111-7009-4000-8000-000000000002', 'Bob Bank',   'bank', 0);

-- ── Shared tx #1: alice logs, split 600/400 ─────────────────────────────────
-- alice = payer (600), bob = partner (400)
INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
VALUES (
  '11111111-7009-4000-8000-000000000020',
  '11111111-7009-4000-8000-000000000001',
  '11111111-7009-4000-8000-000000000011',
  (SELECT id FROM public.categories
    WHERE user_id = '11111111-7009-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  1000, '2026-06-01', 'expense', true
);

INSERT INTO public.transaction_splits (transaction_id, payer_id, payer_share_minor, partner_share_minor, split_method)
VALUES ('11111111-7009-4000-8000-000000000020',
        '11111111-7009-4000-8000-000000000001', 600, 400, 'fixed');

-- ── Shared tx #2: bob logs, NO split record (bob paid full 800) ──────────────
INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
VALUES (
  '11111111-7009-4000-8000-000000000021',
  '11111111-7009-4000-8000-000000000002',
  '11111111-7009-4000-8000-000000000012',
  (SELECT id FROM public.categories
    WHERE user_id = '11111111-7009-4000-8000-000000000002' AND type = 'expense' LIMIT 1),
  800, '2026-06-05', 'expense', true
);
-- No transaction_splits row — fallback: bob pays 800, alice pays 0

-- ── Pre-join Shared tx (dated before join_date 2026-01-01) ───────────────────
INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
VALUES (
  '11111111-7009-4000-8000-000000000022',
  '11111111-7009-4000-8000-000000000001',
  '11111111-7009-4000-8000-000000000011',
  (SELECT id FROM public.categories
    WHERE user_id = '11111111-7009-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  999, '2025-12-31', 'expense', true
);

-- ── Personal (non-shared) tx ─────────────────────────────────────────────────
INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
VALUES (
  '11111111-7009-4000-8000-000000000023',
  '11111111-7009-4000-8000-000000000001',
  '11111111-7009-4000-8000-000000000011',
  (SELECT id FROM public.categories
    WHERE user_id = '11111111-7009-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  500, '2026-06-10', 'expense', false
);

-- ── Shared tx that will be reclassified to Personal ──────────────────────────
INSERT INTO public.transactions (id, user_id, account_id, category_id, amount_minor, date, type, is_shared)
VALUES (
  '11111111-7009-4000-8000-000000000024',
  '11111111-7009-4000-8000-000000000001',
  '11111111-7009-4000-8000-000000000011',
  (SELECT id FROM public.categories
    WHERE user_id = '11111111-7009-4000-8000-000000000001' AND type = 'expense' LIMIT 1),
  200, '2026-06-12', 'expense', true
);

-- ── Shared Goal + alice's contribution ───────────────────────────────────────
INSERT INTO public.goals (id, user_id, name, target_minor, is_shared)
VALUES (
  '11111111-7009-4000-8000-000000000030',
  '11111111-7009-4000-8000-000000000001',
  'Shared Vacation', 100000, true
);

INSERT INTO public.goal_contributions (goal_id, user_id, amount_minor, date)
VALUES (
  '11111111-7009-4000-8000-000000000030',
  '11111111-7009-4000-8000-000000000001',
  300, '2026-06-03'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T1: Verify seeded data exists before running RPC tests (non-vacuous)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM public.transactions
    WHERE id IN (
      '11111111-7009-4000-8000-000000000020',
      '11111111-7009-4000-8000-000000000021',
      '11111111-7009-4000-8000-000000000022',
      '11111111-7009-4000-8000-000000000023',
      '11111111-7009-4000-8000-000000000024'
    )),
  5,
  'T1: all 5 seeded transactions exist'
);

SELECT is(
  (SELECT count(*)::int FROM public.transaction_splits
    WHERE transaction_id = '11111111-7009-4000-8000-000000000020'),
  1,
  'T1: split record for tx #1 exists'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T2: alice calls RPC — basic split aggregation
-- ─────────────────────────────────────────────────────────────────────────────
SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-7009-4000-8000-000000000001"}';

-- Alice's total: 600 (payer_share tx#1) + 0 (no-split tx#2, alice not owner) + 200 (tx#24, no-split, alice owner)
-- But tx#24 is still is_shared=true at this point — so it's included
-- alice_total = 600 + 0 + 200 = 800
-- bob_total = 400 (partner_share tx#1) + 800 (full amount tx#2, no-split, bob owner) = 1200

-- First check: RPC returns 2 rows
SELECT is(
  (SELECT count(*)::int FROM public.rpc_get_contribution_analysis(NULL, NULL)),
  2,
  'T2: alice call returns 2 rows'
);

SELECT is(
  (SELECT total_paid_minor
     FROM public.rpc_get_contribution_analysis(NULL, NULL)
    WHERE contributor_id = '11111111-7009-4000-8000-000000000001'),
  800::bigint,
  'T2: alice total_paid = 800 (600 payer_share + 200 no-split owner)'
);

SELECT is(
  (SELECT total_paid_minor
     FROM public.rpc_get_contribution_analysis(NULL, NULL)
    WHERE contributor_id = '11111111-7009-4000-8000-000000000002'),
  1200::bigint,
  'T2: bob total_paid = 1200 (400 partner_share + 800 no-split owner)'
);

SELECT is(
  (SELECT transaction_count
     FROM public.rpc_get_contribution_analysis(NULL, NULL)
    WHERE contributor_id = '11111111-7009-4000-8000-000000000001'),
  3::bigint,
  'T2: transaction_count = 3 shared txns (tx#1, tx#2, tx#24 all shared)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T3: Pre-join transaction is excluded
-- ─────────────────────────────────────────────────────────────────────────────
-- Non-vacuous: pre-assert pre-join tx exists
SELECT is(
  (SELECT count(*)::int FROM public.transactions
    WHERE id = '11111111-7009-4000-8000-000000000022' AND is_shared = true),
  1,
  'T3: pre-join shared tx exists in DB'
);

-- Pre-join tx (999 minor, dated 2025-12-31) must NOT appear in totals
-- If it were included, alice's total would be 800+999=1799 — but we expect 800
SELECT is(
  (SELECT total_paid_minor
     FROM public.rpc_get_contribution_analysis(NULL, NULL)
    WHERE contributor_id = '11111111-7009-4000-8000-000000000001'),
  800::bigint,
  'T3: pre-join tx excluded from alice total (still 800)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T4: Personal (is_shared=false) transaction excluded
-- ─────────────────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM public.transactions
    WHERE id = '11111111-7009-4000-8000-000000000023' AND is_shared = false),
  1,
  'T4: personal tx exists in DB'
);

-- Personal tx (500 minor) must NOT appear — alice total unchanged
SELECT is(
  (SELECT total_paid_minor
     FROM public.rpc_get_contribution_analysis(NULL, NULL)
    WHERE contributor_id = '11111111-7009-4000-8000-000000000001'),
  800::bigint,
  'T4: personal tx excluded from alice total (still 800)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T5: Reclassify Shared→Personal removes from figures
-- ─────────────────────────────────────────────────────────────────────────────
-- tx#24 (200 minor, alice's no-split Shared tx) → set is_shared=false
SET LOCAL role TO postgres;
UPDATE public.transactions
   SET is_shared = false
 WHERE id = '11111111-7009-4000-8000-000000000024';

-- Switch back to alice
SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-7009-4000-8000-000000000001"}';

-- Non-vacuous: confirm is_shared is now false
SELECT is(
  (SELECT is_shared FROM public.transactions
    WHERE id = '11111111-7009-4000-8000-000000000024'),
  false,
  'T5: tx#24 reclassified to Personal'
);

-- alice total drops from 800 → 600 (tx#24 removed)
SELECT is(
  (SELECT total_paid_minor
     FROM public.rpc_get_contribution_analysis(NULL, NULL)
    WHERE contributor_id = '11111111-7009-4000-8000-000000000001'),
  600::bigint,
  'T5: reclassified tx excluded from alice total (now 600)'
);

-- ─────────────────────────────────────────────────────────000000000000000──────
-- T6: Shared Goal contribution included
-- ─────────────────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM public.goal_contributions gc
    JOIN public.goals g ON g.id = gc.goal_id
   WHERE g.id = '11111111-7009-4000-8000-000000000030'
     AND gc.user_id = '11111111-7009-4000-8000-000000000001'),
  1,
  'T6: shared goal contribution exists'
);

SELECT is(
  (SELECT goal_contribution_minor
     FROM public.rpc_get_contribution_analysis(NULL, NULL)
    WHERE contributor_id = '11111111-7009-4000-8000-000000000001'),
  300::bigint,
  'T6: alice goal_contribution_minor = 300'
);

SELECT is(
  (SELECT goal_contribution_minor
     FROM public.rpc_get_contribution_analysis(NULL, NULL)
    WHERE contributor_id = '11111111-7009-4000-8000-000000000002'),
  0::bigint,
  'T6: bob goal_contribution_minor = 0 (no contributions)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T7: bob calling RPC gets symmetric result
-- ─────────────────────────────────────────────────────────────────────────────
SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-7009-4000-8000-000000000002"}';

SELECT is(
  (SELECT count(*)::int FROM public.rpc_get_contribution_analysis(NULL, NULL)),
  2,
  'T7: bob call also returns 2 rows (symmetric)'
);

SELECT is(
  (SELECT total_paid_minor
     FROM public.rpc_get_contribution_analysis(NULL, NULL)
    WHERE contributor_id = '11111111-7009-4000-8000-000000000001'),
  600::bigint,
  'T7: bob sees alice total = 600 (symmetric view)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T8: carol (no family) gets 0 rows
-- ─────────────────────────────────────────────────────────────────────────────
SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-7009-4000-8000-000000000003"}';

SELECT is(
  (SELECT count(*)::int FROM public.rpc_get_contribution_analysis(NULL, NULL)),
  0,
  'T8: carol (no family) gets 0 rows'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T9: Period filter — this month only (June 2026)
-- ─────────────────────────────────────────────────────────────────────────────
SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-7009-4000-8000-000000000001"}';

-- June 2026 period: tx#1 (Jun 1), tx#2 (Jun 5) are Shared; tx#24 now Personal
-- alice in June: 600 (payer_share tx#1) + 0 (no-split tx#2) = 600
SELECT is(
  (SELECT total_paid_minor
     FROM public.rpc_get_contribution_analysis('2026-06-01'::date, '2026-06-30'::date)
    WHERE contributor_id = '11111111-7009-4000-8000-000000000001'),
  600::bigint,
  'T9: period filter (June 2026) — alice = 600'
);

SELECT finish();
ROLLBACK;
