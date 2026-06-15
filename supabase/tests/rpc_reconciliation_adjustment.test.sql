-- rpc_reconciliation_adjustment.test.sql
-- Story 8.3: Two-Step Close-the-Month Reconciliation
--
-- pgTAP UUID block: 11111111-8003-*
--   alice:       11111111-8003-4000-8000-000000000001
--   bob:         11111111-8003-4000-8000-000000000002
--   stranger:    11111111-8003-4000-8000-000000000003
--   family_unit: 11111111-8003-4000-8000-000000000010
--   alice acct:  11111111-8003-4000-8000-000000000011
--   bob acct:    11111111-8003-4000-8000-000000000012

BEGIN;

SELECT plan(7);

-- ─── Seed ───────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email) VALUES
  ('11111111-8003-4000-8000-000000000001', 'alice-8003@test.com'),
  ('11111111-8003-4000-8000-000000000002', 'bob-8003@test.com'),
  ('11111111-8003-4000-8000-000000000003', 'stranger-8003@test.com');

UPDATE public.profiles SET currency = 'USD', onboarding_step = 5
  WHERE id IN (
    '11111111-8003-4000-8000-000000000001',
    '11111111-8003-4000-8000-000000000002',
    '11111111-8003-4000-8000-000000000003'
  );

INSERT INTO public.family_units (id) VALUES
  ('11111111-8003-4000-8000-000000000010');

INSERT INTO public.family_members (family_unit_id, user_id, join_date) VALUES
  ('11111111-8003-4000-8000-000000000010', '11111111-8003-4000-8000-000000000001', current_date - 30),
  ('11111111-8003-4000-8000-000000000010', '11111111-8003-4000-8000-000000000002', current_date - 30);

INSERT INTO public.accounts (id, user_id, name, type, actual_balance_minor, currency) VALUES
  ('11111111-8003-4000-8000-000000000011', '11111111-8003-4000-8000-000000000001', 'Alice Checking', 'bank', 100000, 'USD'),
  ('11111111-8003-4000-8000-000000000012', '11111111-8003-4000-8000-000000000002', 'Bob Checking', 'bank', 50000, 'USD');

-- ─── S1: Valid adjustment inserts a row and returns a UUID ───────────────────

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-8003-4000-8000-000000000001"}';

CREATE TEMP TABLE s1_result (adj_id UUID) ON COMMIT DROP;
GRANT INSERT ON s1_result TO authenticated;
INSERT INTO s1_result SELECT public.rpc_reconciliation_adjustment(
  '11111111-8003-4000-8000-000000000010'::uuid,
  '11111111-8003-4000-8000-000000000011'::uuid,
  -500::bigint,
  'bank balance correction'::text,
  NULL::uuid
);

SELECT isnt(
  (SELECT adj_id FROM s1_result),
  NULL::uuid,
  'S1: valid adjustment returns a non-null UUID'
);

-- ─── S2: delta_minor = 0 → raises 23514 (CHECK violation) ───────────────────

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-8003-4000-8000-000000000001"}';

SELECT throws_ok(
  $$SELECT public.rpc_reconciliation_adjustment(
    '11111111-8003-4000-8000-000000000010'::uuid,
    '11111111-8003-4000-8000-000000000011'::uuid,
    0::bigint,
    NULL::text,
    NULL::uuid
  )$$,
  '23514',
  NULL::text,
  'S2: delta_minor=0 raises 23514'
);

-- ─── S3: Stranger (non-family-member) → raises 42501 ────────────────────────

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-8003-4000-8000-000000000003"}';

SELECT throws_ok(
  $$SELECT public.rpc_reconciliation_adjustment(
    '11111111-8003-4000-8000-000000000010'::uuid,
    '11111111-8003-4000-8000-000000000011'::uuid,
    -200::bigint,
    NULL::text,
    NULL::uuid
  )$$,
  '42501',
  NULL::text,
  'S3: stranger raises 42501'
);

-- ─── S4: Account not owned by caller → raises P0002 ─────────────────────────
-- alice attempts to write an adjustment for bob's account

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-8003-4000-8000-000000000001"}';

SELECT throws_ok(
  $$SELECT public.rpc_reconciliation_adjustment(
    '11111111-8003-4000-8000-000000000010'::uuid,
    '11111111-8003-4000-8000-000000000012'::uuid,
    -100::bigint,
    NULL::text,
    NULL::uuid
  )$$,
  'P0002',
  NULL::text,
  'S4: account not owned by caller raises P0002'
);

-- ─── S5: Non-owner SELECT → 0 rows (RLS isolates) ───────────────────────────
-- Stranger cannot see alice's adjustment

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-8003-4000-8000-000000000003"}';

SELECT is(
  (SELECT count(*)::int FROM public.reconciliation_adjustments),
  0,
  'S5: stranger sees 0 reconciliation_adjustments rows (RLS)'
);

-- ─── S6: Bob can write adjustment for his own account ───────────────────────

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-8003-4000-8000-000000000002"}';

CREATE TEMP TABLE s6_result (adj_id UUID) ON COMMIT DROP;
GRANT INSERT ON s6_result TO authenticated;
INSERT INTO s6_result SELECT public.rpc_reconciliation_adjustment(
  '11111111-8003-4000-8000-000000000010'::uuid,
  '11111111-8003-4000-8000-000000000012'::uuid,
  1000::bigint,
  NULL::text,
  NULL::uuid
);

SELECT isnt(
  (SELECT adj_id FROM s6_result),
  NULL::uuid,
  'S6: bob (either partner) can write an adjustment for his own account'
);

-- ─── S7: Multiple adjustments to same account → allowed ─────────────────────
-- alice writes a second adjustment for the same account (no UNIQUE constraint)

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-8003-4000-8000-000000000001"}';

SELECT public.rpc_reconciliation_adjustment(
  '11111111-8003-4000-8000-000000000010'::uuid,
  '11111111-8003-4000-8000-000000000011'::uuid,
  200::bigint,
  'second adjustment'::text,
  NULL::uuid
);

SELECT is(
  (SELECT count(*)::int FROM public.reconciliation_adjustments
   WHERE account_id = '11111111-8003-4000-8000-000000000011'
     AND created_by = '11111111-8003-4000-8000-000000000001'),
  2,
  'S7: multiple adjustments to the same account in the same period are allowed'
);

SELECT * FROM finish();
ROLLBACK;
