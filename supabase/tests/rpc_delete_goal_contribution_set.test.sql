-- pgTAP tests: rpc_delete_goal_contribution_set (Task 10 / 0061)
--
-- UUID block 11111111-2010-* (Phase 2 Task 10):
--   owner    : 11111111-2010-4000-8000-000000000001
--   attacker : 11111111-2010-4000-8000-000000000002
--   goal     : 11111111-2010-4000-8000-000000000010
--   category : 11111111-2010-4000-8000-000000000011
--   macro    : 11111111-2010-4000-8000-000000000012

BEGIN;

SELECT plan(6);

-- ── Setup ──────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email) VALUES
  ('11111111-2010-4000-8000-000000000001', 'owner_gcset@test.local'),
  ('11111111-2010-4000-8000-000000000002', 'attacker_gcset@test.local')
ON CONFLICT (id) DO NOTHING;

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-2010-4000-8000-000000000001"}';

INSERT INTO public.categories (id, user_id, name, type)
VALUES ('11111111-2010-4000-8000-000000000011', '11111111-2010-4000-8000-000000000001', 'Savings', 'expense')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.goals (id, user_id, name, target_minor)
VALUES ('11111111-2010-4000-8000-000000000010', '11111111-2010-4000-8000-000000000001', 'Holiday Fund', 10000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.macros (id, user_id, name, amount_minor, goal_id, account_id, category_id)
VALUES (
  '11111111-2010-4000-8000-000000000012',
  '11111111-2010-4000-8000-000000000001',
  'Holiday Save',
  2500,
  '11111111-2010-4000-8000-000000000010',
  NULL,
  '11111111-2010-4000-8000-000000000011'
)
ON CONFLICT (id) DO NOTHING;

-- Apply the macro to create a contribution set
CREATE TEMP TABLE t_app_id (application_id UUID) ON COMMIT DROP;
INSERT INTO t_app_id
  SELECT public.rpc_apply_macro('11111111-2010-4000-8000-000000000012'::UUID);

-- ── T1: Anti-vacuous — owner has a macro-applied contribution ─────────────────

SELECT is(
  (SELECT COUNT(*)::int FROM public.goal_contributions
   WHERE macro_application_id = (SELECT application_id FROM t_app_id)
     AND user_id = '11111111-2010-4000-8000-000000000001'),
  1,
  'T1: owner has exactly one macro-applied contribution before deletion'
);

-- ── T2: Deletion succeeds for the owner ──────────────────────────────────────

SELECT lives_ok(
  $$SELECT public.rpc_delete_goal_contribution_set(
    (SELECT application_id FROM t_app_id)
  )$$,
  'T2: rpc_delete_goal_contribution_set succeeds for owner'
);

-- ── T3: Contribution rows are gone after deletion ─────────────────────────────

SELECT is(
  (SELECT COUNT(*)::int FROM public.goal_contributions
   WHERE macro_application_id = (SELECT application_id FROM t_app_id)),
  0,
  'T3: goal_contributions rows deleted from the set'
);

-- ── T4: Second call (empty set) raises P0002 ──────────────────────────────────

SELECT throws_ok(
  $$SELECT public.rpc_delete_goal_contribution_set(
    (SELECT application_id FROM t_app_id)
  )$$,
  'P0002',
  NULL::text,
  'T4: second call on already-deleted set raises P0002'
);

-- ── T5: Cross-user — attacker cannot delete owner's contribution set ──────────

-- First re-apply macro as owner to create a fresh set
CREATE TEMP TABLE t_app_id2 (application_id UUID) ON COMMIT DROP;
INSERT INTO t_app_id2
  SELECT public.rpc_apply_macro('11111111-2010-4000-8000-000000000012'::UUID);

SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-2010-4000-8000-000000000002"}';

SELECT throws_ok(
  $$SELECT public.rpc_delete_goal_contribution_set(
    (SELECT application_id FROM t_app_id2)
  )$$,
  'P0002',
  NULL::text,
  'T5: attacker cannot delete owner''s contribution set (P0002)'
);

-- ── T6: NULL application_id raises P0002 (no rows match = not found) ──────────

SELECT throws_ok(
  $$SELECT public.rpc_delete_goal_contribution_set(NULL::UUID)$$,
  'P0002',
  NULL::text,
  'T6: NULL application_id raises P0002'
);

SELECT * FROM finish();
ROLLBACK;
