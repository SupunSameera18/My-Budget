-- Migration: 0065_notification_partner_tx_idempotency
-- Adds a structural unique index for partner_shared_transaction notification dedup
-- (Task 4a follow-up from Phase 2 code review)

CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_partner_tx
  ON public.notifications (user_id, (metadata->>'transaction_id'))
  WHERE type = 'partner_shared_transaction';
