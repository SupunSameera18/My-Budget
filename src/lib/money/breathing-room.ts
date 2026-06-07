/**
 * Authoritative Breathing Room formula for the current period.
 * breathing_room = income − expense − committed_budget_slack
 *
 * CALLER CONTRACT: incomeSumMinor and expenseSumMinor must already exclude:
 *   - Internal Transfers (FR-7)
 *   - External Transfers (FR-8)
 *   - Reconciliation Adjustments
 * This function performs no filtering — it trusts the inputs.
 *
 * Replaces the provisional E1 `applyTransactionToBreathingRoom` for server-authoritative
 * computations. The E1 function remains for client-side optimistic preview only.
 */

export type BreathingRoomBudget = {
  limitMinor: number; // budget spending limit (integer minor units)
  actualMinor: number; // actual spend so far this period (integer minor units)
};

export type BreathingRoomResult = {
  breathingRoomMinor: number; // final value (can be negative)
  committedSlackMinor: number; // Σ max(0, limit − actual) across all active budgets
};

export function computeBreathingRoom(
  incomeSumMinor: number,
  expenseSumMinor: number,
  activeBudgets: BreathingRoomBudget[],
): BreathingRoomResult {
  const committedSlackMinor = activeBudgets.reduce(
    (sum, b) => sum + Math.max(0, b.limitMinor - b.actualMinor),
    0,
  );
  const breathingRoomMinor =
    incomeSumMinor - expenseSumMinor - committedSlackMinor;
  return { breathingRoomMinor, committedSlackMinor };
}
