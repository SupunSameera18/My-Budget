-- pgTAP tests for Story 9.6: push_subscriptions RLS + notifications.push_notified_at
-- UUID block: 11111111-9006-*
--   alice: 11111111-9006-4000-8000-000000000001
--   bob:   11111111-9006-4000-8000-000000000002

BEGIN;

SELECT plan(9);

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed users
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email)
VALUES
  ('11111111-9006-4000-8000-000000000001', 'alice-9006@example.com'),
  ('11111111-9006-4000-8000-000000000002', 'bob-9006@example.com')
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- T1: push_subscriptions has expected columns (and no extras)
-- ──────────────────────────────────────────────────────────────────────────────
SELECT columns_are(
  'public', 'push_subscriptions',
  ARRAY['id', 'user_id', 'endpoint', 'p256dh', 'auth', 'user_agent', 'created_at'],
  'T1: push_subscriptions has all expected columns'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T2: postgres (superuser) INSERT for alice succeeds
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO public.push_subscriptions (id, user_id, endpoint, p256dh, auth)
VALUES (
  '11111111-9006-4000-8000-000000000010',
  '11111111-9006-4000-8000-000000000001',
  'https://fcm.example.com/alice-endpoint',
  'alice-p256dh-key',
  'alice-auth-secret'
);

SELECT is(
  (SELECT count(*)::bigint FROM public.push_subscriptions
   WHERE user_id = '11111111-9006-4000-8000-000000000001'),
  1::bigint,
  'T2: postgres INSERT for alice succeeds'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- Switch to alice
-- ──────────────────────────────────────────────────────────────────────────────
SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-9006-4000-8000-000000000001"}';

-- ──────────────────────────────────────────────────────────────────────────────
-- T3: alice can SELECT her own subscription
-- ──────────────────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT count(*)::bigint FROM public.push_subscriptions
   WHERE id = '11111111-9006-4000-8000-000000000010'),
  1::bigint,
  'T3: alice can SELECT her own subscription'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T4: bob cannot SELECT alice's subscription
-- ──────────────────────────────────────────────────────────────────────────────
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-9006-4000-8000-000000000002"}';

SELECT is(
  (SELECT count(*)::bigint FROM public.push_subscriptions
   WHERE user_id = '11111111-9006-4000-8000-000000000001'),
  0::bigint,
  'T4: bob cannot SELECT alice''s subscription'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T5: alice can INSERT a subscription for herself
-- ──────────────────────────────────────────────────────────────────────────────
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-9006-4000-8000-000000000001"}';

INSERT INTO public.push_subscriptions (id, user_id, endpoint, p256dh, auth)
VALUES (
  '11111111-9006-4000-8000-000000000011',
  '11111111-9006-4000-8000-000000000001',
  'https://fcm.example.com/alice-endpoint-2',
  'alice-p256dh-key-2',
  'alice-auth-secret-2'
);

SELECT is(
  (SELECT count(*)::bigint FROM public.push_subscriptions
   WHERE user_id = '11111111-9006-4000-8000-000000000001'),
  2::bigint,
  'T5: alice can INSERT a subscription for herself'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T6: alice cannot INSERT a subscription with user_id = bob (RLS WITH CHECK)
-- ──────────────────────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (
      '11111111-9006-4000-8000-000000000002',
      'https://fcm.example.com/attack-endpoint',
      'attack-p256dh',
      'attack-auth'
    )$$,
  '42501',
  NULL::text,
  'T6: alice cannot INSERT a subscription for bob (RLS WITH CHECK violation)'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T7: alice can DELETE her own subscription
-- ──────────────────────────────────────────────────────────────────────────────
DELETE FROM public.push_subscriptions
WHERE id = '11111111-9006-4000-8000-000000000011';

SELECT is(
  (SELECT count(*)::bigint FROM public.push_subscriptions
   WHERE id = '11111111-9006-4000-8000-000000000011'),
  0::bigint,
  'T7: alice DELETE on her own subscription succeeds, 0 rows remain'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T8: alice cannot UPDATE a subscription (UPDATE privilege revoked)
-- ──────────────────────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$UPDATE public.push_subscriptions SET endpoint = 'hacked'
    WHERE id = '11111111-9006-4000-8000-000000000010'$$,
  '42501',
  NULL::text,
  'T8: alice UPDATE raises 42501 (UPDATE revoked)'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- T9: notifications.push_notified_at column exists with type timestamptz
-- ──────────────────────────────────────────────────────────────────────────────
SET LOCAL role TO postgres;

SELECT is(
  (SELECT data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'notifications'
     AND column_name = 'push_notified_at'),
  'timestamp with time zone',
  'T9: notifications.push_notified_at column is timestamptz'
);

SELECT * FROM finish();
ROLLBACK;
