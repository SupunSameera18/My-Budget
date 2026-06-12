-- pgTAP schema shape + RLS + trigger tests for Epic 7 Story 7.1a (family schema)
-- UUID block: dddddddd-* (reserved for E7; see dev-learnings §5)
-- Alice: dddddddd-dddd-4ddd-8ddd-000000000001
-- Bob:   dddddddd-dddd-4ddd-8ddd-000000000002
-- Carol: dddddddd-dddd-4ddd-8ddd-000000000003
-- Unit:  dddddddd-dddd-4ddd-8ddd-000000000010

BEGIN;

SELECT plan(24);

-- ── 1–4: family_units table shape ────────────────────────────────────────────

SELECT has_table('public', 'family_units', 'family_units table exists');
SELECT has_column('public', 'family_units', 'id', 'family_units.id exists');
SELECT has_column('public', 'family_units', 'created_at', 'family_units.created_at exists');
SELECT col_not_null('public', 'family_units', 'created_at', 'family_units.created_at is NOT NULL');

-- ── 5–16: family_members table shape ─────────────────────────────────────────

SELECT has_table('public', 'family_members', 'family_members table exists');

SELECT has_column('public', 'family_members', 'family_unit_id', 'family_members.family_unit_id exists');
SELECT col_not_null('public', 'family_members', 'family_unit_id', 'family_unit_id is NOT NULL');

SELECT has_column('public', 'family_members', 'user_id', 'family_members.user_id exists');
SELECT col_not_null('public', 'family_members', 'user_id', 'user_id is NOT NULL');

SELECT has_column('public', 'family_members', 'join_date', 'family_members.join_date exists');
SELECT col_not_null('public', 'family_members', 'join_date', 'join_date is NOT NULL');

SELECT has_column('public', 'family_members', 'hide_personal', 'family_members.hide_personal exists');
SELECT col_not_null('public', 'family_members', 'hide_personal', 'hide_personal is NOT NULL');
SELECT is(
  (SELECT column_default FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'family_members'
     AND column_name = 'hide_personal'),
  'false',
  'hide_personal defaults to false'
);

SELECT has_column('public', 'family_members', 'joined_at', 'family_members.joined_at exists');
SELECT col_not_null('public', 'family_members', 'joined_at', 'joined_at is NOT NULL');

-- ── 17–19: transactions.is_shared column ─────────────────────────────────────

SELECT has_column('public', 'transactions', 'is_shared', 'transactions.is_shared exists');
SELECT col_not_null('public', 'transactions', 'is_shared', 'is_shared is NOT NULL');
SELECT is(
  (SELECT column_default FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'transactions'
     AND column_name = 'is_shared'),
  'false',
  'is_shared defaults to false'
);

-- ── 20–21: ≤2 members trigger (runs as postgres to bypass RLS) ───────────────

SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email) VALUES
  ('dddddddd-dddd-4ddd-8ddd-000000000001', 'alice_schema@test.local'),
  ('dddddddd-dddd-4ddd-8ddd-000000000002', 'bob_schema@test.local'),
  ('dddddddd-dddd-4ddd-8ddd-000000000003', 'carol_schema@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.family_units (id) VALUES ('dddddddd-dddd-4ddd-8ddd-000000000010')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO public.family_members (family_unit_id, user_id, join_date)
  VALUES ('dddddddd-dddd-4ddd-8ddd-000000000010',
          'dddddddd-dddd-4ddd-8ddd-000000000001', '2026-01-01')
  ON CONFLICT DO NOTHING;

INSERT INTO public.family_members (family_unit_id, user_id, join_date)
  VALUES ('dddddddd-dddd-4ddd-8ddd-000000000010',
          'dddddddd-dddd-4ddd-8ddd-000000000002', '2026-01-15')
  ON CONFLICT DO NOTHING;

-- Anti-vacuous: confirm 2 members exist before testing the 3rd-member block
SELECT is(
  (SELECT COUNT(*)::int FROM public.family_members
   WHERE family_unit_id = 'dddddddd-dddd-4ddd-8ddd-000000000010'),
  2,
  'Anti-vacuous: 2 members in family unit before trigger test'
);

-- Third member must fail with 23514 (check_violation ERRCODE from trigger)
SELECT throws_ok(
  $$INSERT INTO public.family_members (family_unit_id, user_id, join_date)
    VALUES ('dddddddd-dddd-4ddd-8ddd-000000000010',
            'dddddddd-dddd-4ddd-8ddd-000000000003', '2026-01-20')$$,
  '23514',
  NULL::text,
  'Third member insert raises SQLSTATE 23514 (trigger blocks it)'
);

-- ── 22: UNIQUE constraint blocks duplicate (family_unit_id, user_id) ─────────
-- Use a separate 1-member unit so the ≤2 trigger does not fire first.
INSERT INTO public.family_units (id)
  VALUES ('dddddddd-dddd-4ddd-8ddd-000000000011') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.family_members (family_unit_id, user_id, join_date)
  VALUES ('dddddddd-dddd-4ddd-8ddd-000000000011',
          'dddddddd-dddd-4ddd-8ddd-000000000001', '2026-01-01')
  ON CONFLICT DO NOTHING;

SELECT throws_ok(
  $$INSERT INTO public.family_members (family_unit_id, user_id, join_date)
    VALUES ('dddddddd-dddd-4ddd-8ddd-000000000011',
            'dddddddd-dddd-4ddd-8ddd-000000000001', '2026-02-01')$$,
  '23505',
  NULL::text,
  'Duplicate (family_unit_id, user_id) raises 23505 (unique_violation)'
);

-- ── 23–24: RLS cross-user SELECT blocked on family_members ───────────────────

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "dddddddd-dddd-4ddd-8ddd-000000000001"}';

-- Anti-vacuous: alice can see her own row(s) — she is in 2 units after UNIQUE test setup
SELECT is(
  (SELECT COUNT(*)::int FROM public.family_members
   WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-000000000001'),
  2,
  'Anti-vacuous: alice can SELECT her own family_members rows (count = 2)'
);

-- Switch to bob: he must NOT be able to read alice's row
SET LOCAL "request.jwt.claims" TO '{"sub": "dddddddd-dddd-4ddd-8ddd-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.family_members
   WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-000000000001'),
  0,
  'Bob cannot SELECT alice''s family_members row (RLS blocks cross-user read)'
);

SELECT * FROM finish();
ROLLBACK;
