import { z } from "zod";

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

// Server-side validation for saveChartPreferences (Phase 2 gap analysis,
// 6-3) — rejects a malformed/untrusted payload before it reaches the DB
// write, rather than trusting the TS type alone at the server-action boundary.
const CHART_TYPE_KEYS = CHART_TYPES.map((c) => c.key) as [
  ChartTypeKey,
  ...ChartTypeKey[],
];

export const chartPreferencesSchema: z.ZodType<ChartPreferences> =
  z.partialRecord(z.enum(CHART_TYPE_KEYS), z.boolean());

/**
 * Returns true if the chart should be shown. Absent key OR null prefs = enabled.
 *
 * `prefs` is read back from a JSONB column — the TS `ChartPreferences` type is
 * only a compile-time assertion, not a runtime guarantee. A row written
 * before chartPreferencesSchema validation existed (or edited directly) could
 * hold a non-boolean value (e.g. the string `"false"`, or `0`). Only an
 * actual boolean `false` disables a chart; any other non-boolean value falls
 * back to the safe default (enabled) rather than being coerced by JS's loose
 * truthiness rules, where `"false" !== false` would already (accidentally)
 * fail open to enabled, but `0 !== false` is also true in JS even though `0`
 * unambiguously means "disabled" in most serialized-boolean conventions —
 * this makes that explicit rather than relying on coincidental behavior.
 */
export function isChartEnabled(
  prefs: ChartPreferences | null,
  key: ChartTypeKey,
): boolean {
  if (prefs === null || prefs === undefined) return true;
  const value: unknown = prefs[key];
  if (value === undefined) return true; // missing key = enabled
  return value !== false && value !== 0 && value !== "false"; // anything else disables only on an explicit falsy-boolean form
}
