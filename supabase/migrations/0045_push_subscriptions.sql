-- Story 9.6: push_subscriptions table — Web Push (VAPID) subscriptions per user-device
-- + push_notified_at on notifications (tracks push delivery, distinct from read_at/dismissed_at)

-- pg_net: enables async HTTP calls from Postgres (used by the optional push-delivery
-- pg_cron job on hosted Supabase — see Dev Notes). Local Supabase 2.106.x has no
-- config.toml key for this; enabling it via CREATE EXTENSION is the supported path.
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE public.push_subscriptions (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id),
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions_owner" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;
-- No UPDATE — subscriptions are replaced via UPSERT (ON CONFLICT), never patched in place.
REVOKE UPDATE, TRUNCATE ON public.push_subscriptions FROM anon, authenticated;

-- push_notified_at tracks when a notification was delivered via Web Push — distinct
-- from read_at (user opened it) and dismissed_at (user cleared it from the inbox).
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS push_notified_at TIMESTAMPTZ;

-- Index for push delivery query: finds undelivered push for non-dismissed notifications.
CREATE INDEX IF NOT EXISTS idx_notifications_push_pending
  ON public.notifications (user_id, created_at DESC)
  WHERE push_notified_at IS NULL AND dismissed_at IS NULL;
