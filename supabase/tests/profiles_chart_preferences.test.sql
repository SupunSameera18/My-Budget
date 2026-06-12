-- pgTAP tests for chart_preferences column on profiles (Story 6.3)
BEGIN;

SELECT plan(3);

-- Setup: two users, owner and attacker
INSERT INTO auth.users (id, email) VALUES
  ('cccccccc-cccc-4ccc-8ccc-000000000001', 'owner6_3@test.com')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (id, email) VALUES
  ('cccccccc-cccc-4ccc-8ccc-000000000002', 'attacker6_3@test.com')
  ON CONFLICT (id) DO NOTHING;

-- 1: chart_preferences column exists on profiles
SELECT has_column(
  'public',
  'profiles',
  'chart_preferences',
  '1: chart_preferences column exists on public.profiles'
);

-- 2: owner can UPDATE chart_preferences with valid JSON
SET LOCAL "request.jwt.claims" TO '{"sub": "cccccccc-cccc-4ccc-8ccc-000000000001"}';
SET LOCAL ROLE authenticated;

UPDATE public.profiles
SET chart_preferences = '{"spending_by_category": true, "income_vs_expenses": false}'::jsonb
WHERE user_id = 'cccccccc-cccc-4ccc-8ccc-000000000001';

SELECT is(
  (SELECT chart_preferences->>'spending_by_category'
   FROM public.profiles
   WHERE user_id = 'cccccccc-cccc-4ccc-8ccc-000000000001'),
  'true',
  '2: owner can UPDATE chart_preferences with valid JSON'
);

-- 3: cross-user UPDATE blocked by RLS (0 rows affected, attacker cannot modify owner's prefs)
-- Reset owner's prefs first
SET LOCAL ROLE postgres;
UPDATE public.profiles
SET chart_preferences = NULL
WHERE user_id = 'cccccccc-cccc-4ccc-8ccc-000000000001';

SET LOCAL "request.jwt.claims" TO '{"sub": "cccccccc-cccc-4ccc-8ccc-000000000002"}';
SET LOCAL ROLE authenticated;

UPDATE public.profiles
  SET chart_preferences = '{"spending_by_category": false}'::jsonb
WHERE user_id = 'cccccccc-cccc-4ccc-8ccc-000000000001';

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT chart_preferences FROM public.profiles
   WHERE user_id = 'cccccccc-cccc-4ccc-8ccc-000000000001'),
  NULL::jsonb,
  '3: cross-user chart_preferences update blocked by RLS'
);

SELECT * FROM finish();
ROLLBACK;
