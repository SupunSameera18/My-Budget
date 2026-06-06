/**
 * Pure TS mirror of the server-side Breathing Room formula.
 * Breathing Room = incomeSum - expenseSum for the current month.
 * This function applies one new transaction to the current total.
 * PURE FUNCTION — no side effects, no rounding, no validation.
 * Caller is responsible for passing valid positive amountMinor.
 */
export function applyTransactionToBreathingRoom(
  currentMinor: number,
  amountMinor: number,
  type: "income" | "expense",
): number {
  if (type === "income") return currentMinor + amountMinor;
  return currentMinor - amountMinor;
}
