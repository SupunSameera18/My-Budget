import { describe, expect, it } from "vitest";
import {
  CHART_TYPES,
  isChartEnabled,
  type ChartTypeKey,
  type SpendingByCategoryItem,
  type MonthlyTotalsItem,
} from "./schema";

// ---- Story 6.4: Chart data type compile checks ----

describe("SpendingByCategoryItem type", () => {
  it("accepts valid item shape (TypeScript compile check)", () => {
    const item: SpendingByCategoryItem = { name: "Food", value: 5000 };
    expect(item.name).toBe("Food");
    expect(item.value).toBe(5000);
  });
});

describe("MonthlyTotalsItem type", () => {
  it("accepts Savings: 0 (never negative — compile check)", () => {
    const item: MonthlyTotalsItem = {
      month: "Jan",
      Income: 100000,
      Savings: 0,
      Expenses: 100000,
    };
    expect(item.Savings).toBe(0);
  });
});

describe("CHART_TYPES", () => {
  it("has exactly 4 entries", () => {
    expect(CHART_TYPES).toHaveLength(4);
  });

  it("includes all expected keys", () => {
    const keys = CHART_TYPES.map((c) => c.key);
    expect(keys).toContain("spending_by_category");
    expect(keys).toContain("income_vs_expenses");
    expect(keys).toContain("budget_performance");
    expect(keys).toContain("this_vs_last_month");
  });
});

describe("isChartEnabled", () => {
  it("returns true when prefs is null", () => {
    expect(isChartEnabled(null, "spending_by_category")).toBe(true);
  });

  it("returns true when prefs is empty object (missing key = enabled)", () => {
    expect(isChartEnabled({}, "spending_by_category")).toBe(true);
  });

  it("returns true when key is explicitly true", () => {
    expect(
      isChartEnabled({ spending_by_category: true }, "spending_by_category"),
    ).toBe(true);
  });

  it("returns false when key is explicitly false", () => {
    expect(
      isChartEnabled({ spending_by_category: false }, "spending_by_category"),
    ).toBe(false);
  });

  it("covers all 4 ChartTypeKey values", () => {
    const keys: ChartTypeKey[] = [
      "spending_by_category",
      "income_vs_expenses",
      "budget_performance",
      "this_vs_last_month",
    ];
    for (const key of keys) {
      expect(isChartEnabled(null, key)).toBe(true);
      expect(isChartEnabled({ [key]: false }, key)).toBe(false);
    }
  });
});
