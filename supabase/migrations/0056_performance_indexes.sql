-- Task 6 (Performance & scalability) — index additions deferred from stories
-- 5-3, 9-7, and 4-2.
--
-- Note: idx_bte_unprocessed on budget_threshold_events (user_id WHERE processed_at IS NULL)
-- was already added in migration 0042_budget_threshold_notifications.sql, covering the
-- (user_id, processed_at) partial-index requirement from the 4-2 deferral.
-- The two new indexes below close the remaining two gaps.

-- 1. goal_contributions.macro_application_id (deferred from 5-3 code review)
--    Future rpc_delete_goal_contribution_set(p_application_id) and any
--    linked-set delete/lookup will full-scan the table without this index.
CREATE INDEX IF NOT EXISTS idx_goal_contributions_macro_application_id
  ON public.goal_contributions (macro_application_id)
  WHERE macro_application_id IS NOT NULL;

-- 2. notifications metadata->>'transaction_id' JSONB expression index (deferred from 9-7)
--    The privacy-aware notifications RPC (0046) and future idempotency checks scan
--    notifications WHERE metadata->>'transaction_id' = '<uuid>' per reclassification.
--    Without an expression index this is a full sequential scan.
CREATE INDEX IF NOT EXISTS idx_notifications_metadata_transaction_id
  ON public.notifications ((metadata->>'transaction_id'))
  WHERE metadata->>'transaction_id' IS NOT NULL;
