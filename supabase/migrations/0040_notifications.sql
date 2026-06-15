-- Story 9.1: notifications table — foundational inbox for all E9 notification types

CREATE TABLE public.notifications (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id),
  type         TEXT NOT NULL CHECK (type IN (
                 'logging_reminder',
                 'budget_threshold',
                 'month_end_summary',
                 'partner_shared_transaction'
               )),
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  link         TEXT,
  metadata     JSONB NOT NULL DEFAULT '{}',
  read_at      TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Owner-only index for inbox queries (non-dismissed only)
CREATE INDEX idx_notifications_user_id_created ON public.notifications (user_id, created_at DESC)
  WHERE dismissed_at IS NULL;

-- RLS: owner SELECT + UPDATE (read_at, dismissed_at only)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_select_owner" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications_update_owner" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- INSERT goes through SECURITY DEFINER RPCs in 9.2–9.5; revoke from clients
GRANT SELECT, UPDATE (read_at, dismissed_at) ON public.notifications TO authenticated;
REVOKE INSERT, DELETE, TRUNCATE ON public.notifications FROM anon, authenticated;
