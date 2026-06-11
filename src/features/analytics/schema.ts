export const CHART_TYPES = [
  { key: "spending_by_category", label: "Spending by Category" },
  { key: "income_vs_expenses", label: "Income vs Expenses" },
  { key: "budget_performance", label: "Budget Performance" },
  { key: "this_vs_last_month", label: "This vs Last Month" },
] as const;

export type ChartTypeKey = (typeof CHART_TYPES)[number]["key"];

export type ChartPreferences = Partial<Record<ChartTypeKey, boolean>>;

/** Returns true if the chart should be shown. Absent key OR null prefs = enabled. */
export function isChartEnabled(
  prefs: ChartPreferences | null,
  key: ChartTypeKey,
): boolean {
  if (prefs === null || prefs === undefined) return true;
  return prefs[key] !== false; // explicitly false = disabled; missing = enabled
}
