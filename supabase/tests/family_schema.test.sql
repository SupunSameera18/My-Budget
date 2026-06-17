-- pgTAP schema shape + RLS + trigger tests for Epic 7 Story 7.1a (family schema)
-- UUID block: dddddddd-* (reserved for E7; see dev-learnings §5)
-- Alice: dddddddd-dddd-4ddd-8ddd-000000000001
-- Bob:   dddddddd-dddd-4ddd-8ddd-000000000002
-- Carol: dddddddd-dddd-4ddd-8ddd-000000000003
-- Unit:  dddddddd-dddd-4ddd-8ddd-000000000010

BEGIN;

SELECT plan(30);

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

SELECT has_column('public', 'family_members', 'joined_at', 'family_members.joined_at exists');
SELECT col_not_null('public', 'family_members', 'joined_at', 'joined_at is NOT NULL');

-- Column type assertions (AC7: "correct columns, types, NOT NULL")
-- Using information_schema — col_type_is() unavailable in this pgTAP version (same
-- limitation as col_default; see dev-learnings §18 debug log).
SELECT is(
  (SELECT data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'family_members'
     AND column_name = 'family_unit_id'),
  'uuid',
  'family_members.family_unit_id type is uuid'
);
SELECT is(
  (SELECT data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'family_members'
     AND column_name = 'join_date'),
  'date',
  'family_members.join_date type is date (not timestamptz)'
);
-- Structural UNIQUE assertion (AC7: "UNIQUE on (family_unit_id, user_id)")
-- Counts how many of the expected columns appear in any UNIQUE constraint on this table.
-- Result = 2 means both columns are covered by a single UNIQUE constraint.
SELECT is(
  (SELECT COUNT(*)::int
   FROM information_schema.key_column_usage kcu
   JOIN information_schema.table_constraints tc
     ON kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema  = tc.table_schema
     AND kcu.table_name    = tc.table_name
   WHERE tc.table_schema   = 'public'
     AND tc.table_name     = 'family_members'
     AND tc.constraint_type = 'UNIQUE'
     AND kcu.column_name IN ('family_unit_id', 'user_id')),
  2,
  'family_members UNIQUE constraint covers (family_unit_id, user_id)'
);

-- ── transactions.is_shared column ────────────────────────────────────────────

SELECT has_column('public', 'transactions', 'is_shared', 'transactions.is_shared exists');
SELECT col_not_null('public', 'transactions', 'is_shared', 'is_shared is NOT NULL');
SELECT is(
  (SELECT column_default FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'transactions'
     AND column_name = 'is_shared'),
  'false',
  'is_shared defaults to false'
);
SELECT is(
  (SELECT data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'transactions'
     AND column_name = 'is_shared'),
  'boolean',
  'transactions.is_shared type is boolean'
);

-- ── ≤2 members trigger (runs as postgres to bypass RLS) ──────────────────────

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

-- ── 21b (0052): join_date immutability trigger ────────────────────────────────
SELECT throws_ok(
  $$UPDATE public.family_members
       SET join_date = '2099-01-01'
     WHERE family_unit_id = 'dddddddd-dddd-4ddd-8ddd-000000000010'
       AND user_id        = 'dddddddd-dddd-4ddd-8ddd-000000000001'$$,
  '23514',
  NULL::text,
  '0052: updating join_date raises 23514 (immutability trigger)'
);

SELECT is(
  (SELECT join_date FROM public.family_members
   WHERE family_unit_id = 'dddddddd-dddd-4ddd-8ddd-000000000010'
     AND user_id        = 'dddddddd-dddd-4ddd-8ddd-000000000001'),
  '2026-01-01'::date,
  '0052: join_date unchanged after blocked update'
);

-- A no-op UPDATE (same value, or a different column) must still succeed —
-- the trigger only blocks an actual join_date change.
SELECT lives_ok(
  $$UPDATE public.family_members
       SET join_date = '2026-01-01'
     WHERE family_unit_id = 'dddddddd-dddd-4ddd-8ddd-000000000010'
       AND user_id        = 'dddddddd-dddd-4ddd-8ddd-000000000001'$$,
  '0052: UPDATE with an unchanged join_date value does not raise'
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

-- ── RLS cross-user SELECT blocked on family_units ─────────────────────────────
-- Alice is a member of both units (0010 + 0011); she should see 2 rows.
-- Carol is seeded in auth.users but never added to any unit; she should see 0.
SET LOCAL "request.jwt.claims" TO '{"sub": "dddddddd-dddd-4ddd-8ddd-000000000001"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.family_units),
  2,
  'Anti-vacuous: alice can SELECT her 2 family_units rows (member of both)'
);

SET LOCAL "request.jwt.claims" TO '{"sub": "dddddddd-dddd-4ddd-8ddd-000000000003"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.family_units),
  0,
  'Carol (non-member) cannot SELECT any family_units rows (RLS blocks)'
);

SELECT * FROM finish();
ROLLBACK;
