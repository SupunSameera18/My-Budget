export type Scope = "personal" | "shared" | "combined";

export type ExportRow = {
  date: string; // "YYYY-MM-DD"
  amount: string; // decimal string, e.g. "50.00" (always positive)
  type: string; // "income" | "expense"
  category: string; // category name or "Uncategorized"
  account: string; // account name or "Unknown"
  note: string; // empty string if null
};

// Chart data shapes — keys MUST match Tremor's `categories` prop strings exactly
export type SpendingByCategoryItem = {
  name: string;
  value: number;
};

export type MonthlyTotalsItem = {
  month: string;
  Income: number;
  Savings: number;
  Expenses: number;
};

export type BudgetPerformanceItem = {
  name: string;
  Budget: number;
  Actual: number;
};

export type ThisVsLastMonthItem = {
  category: string;
  "This Month": number;
  "Last Month": number;
};

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
