/**
 * Payload for a budget-threshold event stored in `budget_threshold_events`.
 * Consumed by E9 Notifications — do NOT change this shape without coordinating E9.
 *
 * Once-per-period guarantee: DB UNIQUE constraint on (budget_id, period_start, period_end).
 * processed_at: null = not yet processed by E9; E9 sets this after sending the notification.
 */
export type BudgetThresholdEventPayload = {
  id: string;
  budget_id: string;
  user_id: string;
  period_start: string; // ISO date: YYYY-MM-DD
  period_end: string; // ISO date: YYYY-MM-DD
  pct_used: number; // e.g. 82.5 for 82.5%
  actual_minor: number; // integer minor units
  fired_at: string; // ISO timestamp
  processed_at: string | null;
};
