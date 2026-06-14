-- pgTAP tests for migration 0032_erasure_setup.sql
-- Covers: tombstone row, erasure_audit table schema, RLS enabled, no authenticated SELECT policy.

BEGIN;
SELECT plan(8);

-- T1: tombstone UUID exists in auth.users
SELECT is(
  (SELECT count(*)::int FROM auth.users
   WHERE id = '00000000-0000-0000-0000-000000000001'),
  1,
  'tombstone UUID exists in auth.users'
);

-- T2: tombstone email is the sentinel address
SELECT is(
  (SELECT email FROM auth.users
   WHERE id = '00000000-0000-0000-0000-000000000001'),
  'former-member@tombstone.invalid',
  'tombstone email is former-member@tombstone.invalid'
);

-- T3: erasure_audit table exists
SELECT has_table('public', 'erasure_audit', 'erasure_audit table exists');

-- T4: erasure_audit has path column
SELECT has_column('public', 'erasure_audit', 'path', 'erasure_audit has path column');

-- T5: erasure_audit has erased_at column
SELECT has_column('public', 'erasure_audit', 'erased_at', 'erasure_audit has erased_at column');

-- T6: erasure_audit has family_unit_id column
SELECT has_column('public', 'erasure_audit', 'family_unit_id', 'erasure_audit has family_unit_id column');

-- T7: RLS is enabled on erasure_audit
SELECT is(
  (SELECT relrowsecurity FROM pg_class
   WHERE relname = 'erasure_audit' AND relnamespace = 'public'::regnamespace),
  true,
  'RLS is enabled on erasure_audit'
);

-- T8: no authenticated SELECT policy on erasure_audit (service-role only)
SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE tablename = 'erasure_audit'
     AND roles @> ARRAY['authenticated']::name[]),
  0,
  'no authenticated policy on erasure_audit'
);

SELECT * FROM finish();
ROLLBACK;
