import { describe, expect, it } from "vitest";
import {
  computeInsights,
  type InsightRuleInput,
} from "@/lib/analytics/insights";

const baseInput: InsightRuleInput = {
  currency: "USD",
  budgetPerformance: null,
  thisVsLastMonth: null,
  monthlyTotals: null,
};

// ---------------------------------------------------------------------------
// ruleAllBudgetsOnTrack
// ---------------------------------------------------------------------------
describe("ruleAllBudgetsOnTrack", () => {
  it("fires positive card when all budgets are under limit", () => {
    const result = computeInsights({
      ...baseInput,
      budgetPerformance: [
        { name: "Groceries", Budget: 50000, Actual: 45000 },
        { name: "Transport", Budget: 20000, Actual: 18000 },
      ],
    });
    const card = result.find((r) => r.id === "all-budgets-on-track");
    expect(card).toBeDefined();
    expect(card!.sentiment).toBe("positive");
  });

  it("fires when one budget is exactly at limit (Actual === Budget)", () => {
    const result = computeInsights({
      ...baseInput,
      budgetPerformance: [{ name: "Groceries", Budget: 50000, Actual: 50000 }],
    });
    expect(result.find((r) => r.id === "all-budgets-on-track")).toBeDefined();
  });

  it("returns null when one budget is over limit", () => {
    const result = computeInsights({
      ...baseInput,
      budgetPerformance: [{ name: "Groceries", Budget: 50000, Actual: 55000 }],
    });
    expect(result.find((r) => r.id === "all-budgets-on-track")).toBeUndefined();
  });

  it("returns null when budgetPerformance is empty array", () => {
    const result = computeInsights({ ...baseInput, budgetPerformance: [] });
    expect(result.find((r) => r.id === "all-budgets-on-track")).toBeUndefined();
  });

  it("returns null when budgetPerformance is null", () => {
    const result = computeInsights({ ...baseInput, budgetPerformance: null });
    expect(result.find((r) => r.id === "all-budgets-on-track")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ruleOverBudget
// ---------------------------------------------------------------------------
describe("ruleOverBudget", () => {
  it("fires warning card when one budget is over limit", () => {
    const result = computeInsights({
      ...baseInput,
      budgetPerformance: [{ name: "Dining", Budget: 30000, Actual: 30500 }],
    });
    const card = result.find((r) => r.id === "over-budget");
    expect(card).toBeDefined();
    expect(card!.sentiment).toBe("warning");
    expect(card!.headline).toContain("Dining");
  });

  it("fires card for the LARGEST overage when multiple budgets are over", () => {
    const result = computeInsights({
      ...baseInput,
      budgetPerformance: [
        { name: "Dining", Budget: 30000, Actual: 30100 }, // 100 over
        { name: "Travel", Budget: 50000, Actual: 51000 }, // 1000 over ← largest
      ],
    });
    const card = result.find((r) => r.id === "over-budget");
    expect(card).toBeDefined();
    expect(card!.headline).toContain("Travel");
  });

  it("returns null when all budgets are on track", () => {
    const result = computeInsights({
      ...baseInput,
      budgetPerformance: [{ name: "Groceries", Budget: 50000, Actual: 40000 }],
    });
    expect(result.find((r) => r.id === "over-budget")).toBeUndefined();
  });

  it("returns null when budgetPerformance is null", () => {
    const result = computeInsights({ ...baseInput, budgetPerformance: null });
    expect(result.find((r) => r.id === "over-budget")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ruleSpendingSpike
// ---------------------------------------------------------------------------
describe("ruleSpendingSpike", () => {
  it("returns null when category is up exactly 20% (strict greater than)", () => {
    const result = computeInsights({
      ...baseInput,
      thisVsLastMonth: [
        { category: "Food", "This Month": 120, "Last Month": 100 },
      ],
    });
    expect(result.find((r) => r.id === "spending-spike")).toBeUndefined();
  });

  it("fires when category is up 25% (> 20% threshold)", () => {
    const result = computeInsights({
      ...baseInput,
      thisVsLastMonth: [
        { category: "Food", "This Month": 125, "Last Month": 100 },
      ],
    });
    const card = result.find((r) => r.id === "spending-spike");
    expect(card).toBeDefined();
    expect(card!.sentiment).toBe("warning");
    expect(card!.headline).toContain("Food");
  });

  it("returns null when Last Month is 0 (new category guard)", () => {
    const result = computeInsights({
      ...baseInput,
      thisVsLastMonth: [
        { category: "NewCat", "This Month": 5000, "Last Month": 0 },
      ],
    });
    expect(result.find((r) => r.id === "spending-spike")).toBeUndefined();
  });

  it("fires for the HIGHEST percentage spike when multiple spikes exist", () => {
    const result = computeInsights({
      ...baseInput,
      thisVsLastMonth: [
        { category: "Food", "This Month": 130, "Last Month": 100 }, // 30%
        { category: "Travel", "This Month": 200, "Last Month": 100 }, // 100% ← highest
      ],
    });
    const card = result.find((r) => r.id === "spending-spike");
    expect(card).toBeDefined();
    expect(card!.headline).toContain("Travel");
  });

  it("returns null when thisVsLastMonth is null", () => {
    const result = computeInsights({ ...baseInput, thisVsLastMonth: null });
    expect(result.find((r) => r.id === "spending-spike")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ruleIncomeUp
// ---------------------------------------------------------------------------
describe("ruleIncomeUp", () => {
  it("fires when income is up 10% month-over-month", () => {
    const result = computeInsights({
      ...baseInput,
      monthlyTotals: [
        { month: "May", Income: 500000, Savings: 50000, Expenses: 450000 },
        { month: "Jun", Income: 550000, Savings: 55000, Expenses: 495000 },
      ],
    });
    const card = result.find((r) => r.id === "income-up");
    expect(card).toBeDefined();
    expect(card!.sentiment).toBe("positive");
  });

  it("fires when income is up exactly 5% (boundary: >= 5%)", () => {
    const result = computeInsights({
      ...baseInput,
      monthlyTotals: [
        { month: "May", Income: 500000, Savings: 50000, Expenses: 450000 },
        { month: "Jun", Income: 525000, Savings: 52500, Expenses: 472500 },
      ],
    });
    expect(result.find((r) => r.id === "income-up")).toBeDefined();
  });

  it("returns null when income is up only 4.9% (below threshold)", () => {
    const result = computeInsights({
      ...baseInput,
      monthlyTotals: [
        { month: "May", Income: 500000, Savings: 50000, Expenses: 450000 },
        // 4.9% increase: 500000 * 1.049 = 524500
        { month: "Jun", Income: 524500, Savings: 52450, Expenses: 472050 },
      ],
    });
    expect(result.find((r) => r.id === "income-up")).toBeUndefined();
  });

  it("returns null when income is DOWN", () => {
    const result = computeInsights({
      ...baseInput,
      monthlyTotals: [
        { month: "May", Income: 500000, Savings: 50000, Expenses: 450000 },
        { month: "Jun", Income: 400000, Savings: 40000, Expenses: 360000 },
      ],
    });
    expect(result.find((r) => r.id === "income-up")).toBeUndefined();
  });

  it("returns null when previous.Income is 0 (avoid division by zero)", () => {
    const result = computeInsights({
      ...baseInput,
      monthlyTotals: [
        { month: "May", Income: 0, Savings: 0, Expenses: 0 },
        { month: "Jun", Income: 500000, Savings: 50000, Expenses: 450000 },
      ],
    });
    expect(result.find((r) => r.id === "income-up")).toBeUndefined();
  });

  it("returns null when monthlyTotals has only 1 item (no previous month)", () => {
    const result = computeInsights({
      ...baseInput,
      monthlyTotals: [
        { month: "Jun", Income: 500000, Savings: 50000, Expenses: 450000 },
      ],
    });
    expect(result.find((r) => r.id === "income-up")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// computeInsights — integration tests
// ---------------------------------------------------------------------------
describe("computeInsights", () => {
  it("returns [] when all input fields are null (no throw)", () => {
    expect(() => computeInsights(baseInput)).not.toThrow();
    expect(computeInsights(baseInput)).toEqual([]);
  });

  it("returns [] when no rules fire", () => {
    // empty budgets + no spike + income barely up (0.4%) + savings at 10% (< 15% threshold)
    const result = computeInsights({
      currency: "USD",
      budgetPerformance: [],
      thisVsLastMonth: [],
      monthlyTotals: [
        { month: "May", Income: 500000, Savings: 50000, Expenses: 450000 },
        { month: "Jun", Income: 502000, Savings: 50200, Expenses: 451800 },
      ],
    });
    expect(result).toEqual([]);
  });

  it("returns cards for all-budgets-on-track and income-up when seed data triggers both", () => {
    const input: InsightRuleInput = {
      currency: "USD",
      budgetPerformance: [
        { name: "Groceries", Budget: 50000, Actual: 45000 },
        { name: "Transport", Budget: 20000, Actual: 18000 },
      ],
      thisVsLastMonth: [
        { category: "Groceries", "This Month": 45000, "Last Month": 44000 }, // 2% up — no spike
      ],
      monthlyTotals: [
        { month: "May", Income: 500000, Savings: 50000, Expenses: 450000 },
        { month: "Jun", Income: 600000, Savings: 150000, Expenses: 450000 }, // 20% income up
      ],
    };
    const result = computeInsights(input);
    const ids = result.map((r) => r.id).sort();
    expect(ids).toEqual(["all-budgets-on-track", "income-up"].sort());
  });
});
