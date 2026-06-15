-- pgTAP tests for Story 9.1: notifications table RLS + privilege enforcement
-- UUID block: 11111111-9001-*
--   alice: 11111111-9001-4000-8000-000000000001
--   bob:   11111111-9001-4000-8000-000000000002

BEGIN;

SELECT plan(8);

-- ── Seed (postgres superuser bypasses RLS/privilege checks) ─────────────────

INSERT INTO auth.users (id, email) VALUES
  ('11111111-9001-4000-8000-000000000001', 'alice-9001@test.com'),
  ('11111111-9001-4000-8000-000000000002', 'bob-9001@test.com');
-- handle_new_user trigger auto-creates profiles

INSERT INTO public.notifications (user_id, type, title, body)
VALUES (
  '11111111-9001-4000-8000-000000000001',
  'budget_threshold',
  'Budget Alert',
  'You have used 80% of your budget.'
);

-- T1: table has all expected columns
SELECT columns_are(
  'public',
  'notifications',
  ARRAY['id','user_id','type','title','body','link','metadata','read_at','dismissed_at','created_at'],
  'T1: notifications has all expected columns'
);

-- T2: postgres-role INSERT seeded successfully → 1 row exists for alice
SELECT is(
  (SELECT COUNT(*)::int FROM public.notifications
   WHERE user_id = '11111111-9001-4000-8000-000000000001'),
  1,
  'T2: postgres superuser can INSERT a notification for alice'
);

-- T3: authenticated=alice can SELECT her own notification
SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-9001-4000-8000-000000000001"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.notifications WHERE user_id = auth.uid()),
  1,
  'T3: alice can SELECT her own notification'
);

-- T4: authenticated=bob cannot SELECT alice's notification
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-9001-4000-8000-000000000002"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.notifications),
  0,
  'T4: bob cannot SELECT alice notification (RLS blocks cross-user)'
);

-- T5: authenticated=alice can UPDATE read_at on her own notification
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-9001-4000-8000-000000000001"}';

UPDATE public.notifications
  SET read_at = now()
  WHERE user_id = auth.uid() AND read_at IS NULL;

SELECT is(
  (SELECT read_at IS NOT NULL FROM public.notifications WHERE user_id = auth.uid() LIMIT 1),
  true,
  'T5: alice can UPDATE read_at on her notification'
);

-- T6: authenticated=bob cannot UPDATE alice's notification (0 rows affected)
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-9001-4000-8000-000000000002"}';

UPDATE public.notifications
  SET dismissed_at = now()
  WHERE true; -- RLS filters to bob's rows only (none exist)

-- Switch to alice to verify her dismissed_at is still NULL
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-9001-4000-8000-000000000001"}';

SELECT is(
  (SELECT dismissed_at IS NULL FROM public.notifications WHERE user_id = auth.uid() LIMIT 1),
  true,
  'T6: bob UPDATE had no effect on alice notification'
);

-- T7: authenticated=alice cannot DELETE → raises 42501 (privilege revoked)
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-9001-4000-8000-000000000001"}';

SELECT throws_ok(
  $$DELETE FROM public.notifications WHERE user_id = auth.uid()$$,
  '42501',
  NULL::text,
  'T7: alice DELETE raises 42501 (INSERT privilege revoked)'
);

-- T8: authenticated=alice cannot INSERT directly → raises 42501 (privilege revoked)
SELECT throws_ok(
  $$INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (auth.uid(), 'logging_reminder', 'Direct insert', 'Should be blocked')$$,
  '42501',
  NULL::text,
  'T8: alice INSERT raises 42501 (INSERT privilege revoked)'
);

SELECT * FROM finish();
ROLLBACK;
