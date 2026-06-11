BEGIN;
SELECT plan(8);

-- Seed users in the cccccccc-* block
INSERT INTO auth.users (id, email) VALUES
  ('cccccccc-cccc-4ccc-8ccc-000000000001', 'owner_health@test.local'),
  ('cccccccc-cccc-4ccc-8ccc-000000000002', 'attacker_health@test.local')
ON CONFLICT (id) DO NOTHING;

-- Test 1: anti-vacuous — owner seed exists
SELECT is(
  (SELECT COUNT(*)::int FROM auth.users WHERE id = 'cccccccc-cccc-4ccc-8ccc-000000000001'),
  1, '1: owner seed exists in auth.users'
);

-- Authenticate as owner (zero transactions at this point)
SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "cccccccc-cccc-4ccc-8ccc-000000000001"}';

-- Test 2: function returns a row for authenticated user (zero transactions)
SELECT ok(
  (SELECT COUNT(*) > 0 FROM public.rpc_get_health_score(CURRENT_DATE, CURRENT_DATE)),
  '2: function returns a row for authenticated user'
);

-- Test 3: zero transactions → has_enough_data=false
SELECT is(
  (SELECT has_enough_data FROM public.rpc_get_health_score(CURRENT_DATE, CURRENT_DATE)),
  false,
  '3: zero transactions → has_enough_data=false'
);

-- Test 3b: zero transactions → score=0
SELECT is(
  (SELECT score FROM public.rpc_get_health_score(CURRENT_DATE, CURRENT_DATE)),
  0,
  '3b: zero transactions → score=0'
);

-- Seed 30 income transactions for owner BEFORE running the isolation test,
-- so test 4 proves the attacker cannot see the owner's real populated data.
SET LOCAL role TO postgres;

SELECT public.seed_default_categories('cccccccc-cccc-4ccc-8ccc-000000000001');

INSERT INTO public.accounts (id, user_id, name, type, currency)
VALUES ('cccccccc-cccc-4ccc-8ccc-aaa000000001', 'cccccccc-cccc-4ccc-8ccc-000000000001', 'Owner Bank', 'bank', 'USD')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.transactions (id, user_id, account_id, category_id, type, amount_minor, date, note)
SELECT
  gen_random_uuid(),
  'cccccccc-cccc-4ccc-8ccc-000000000001',
  'cccccccc-cccc-4ccc-8ccc-aaa000000001',
  (SELECT id FROM public.categories WHERE user_id = 'cccccccc-cccc-4ccc-8ccc-000000000001' AND type = 'income' LIMIT 1),
  'income',
  100000,
  CURRENT_DATE,
  'health score seed tx ' || n
FROM generate_series(1, 30) AS n;

-- Test 4: cross-user isolation — attacker queries while owner has 30 real transactions.
-- If RLS were broken and attacker saw owner's data, has_enough_data would be true.
-- Attacker has zero transactions of their own, so must see has_enough_data=false.
SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "cccccccc-cccc-4ccc-8ccc-000000000002"}';

SELECT is(
  (SELECT has_enough_data FROM public.rpc_get_health_score(CURRENT_DATE, CURRENT_DATE)),
  false,
  '4: attacker (no transactions) sees has_enough_data=false while owner has 30 — isolation confirmed'
);

-- Test 4b: attacker score=0 (own empty data only)
SELECT is(
  (SELECT score FROM public.rpc_get_health_score(CURRENT_DATE, CURRENT_DATE)),
  0,
  '4b: attacker score=0 (own data only, not owner data)'
);

-- Switch back to owner
SET LOCAL "request.jwt.claims" TO '{"sub": "cccccccc-cccc-4ccc-8ccc-000000000001"}';

-- Test 5: has_enough_data=true when transactionCount >= 30
SELECT is(
  (SELECT has_enough_data FROM public.rpc_get_health_score(CURRENT_DATE, CURRENT_DATE)),
  true,
  '5: 30 transactions → has_enough_data=true'
);

-- Test 6: score is within valid range [0, 100]
SELECT ok(
  (SELECT score BETWEEN 0 AND 100 FROM public.rpc_get_health_score(CURRENT_DATE, CURRENT_DATE)),
  '6: score is within valid range [0, 100]'
);

SELECT * FROM finish();
ROLLBACK;
