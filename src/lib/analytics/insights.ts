import type {
  BudgetPerformanceItem,
  MonthlyTotalsItem,
  ThisVsLastMonthItem,
} from "@/features/analytics/schema";
import { formatMoney } from "@/lib/format";

export type InsightSentiment = "positive" | "warning" | "neutral";

export type InsightData = {
  id: string;
  headline: string;
  detail?: string;
  sentiment: InsightSentiment;
};

export type InsightRuleInput = {
  budgetPerformance: BudgetPerformanceItem[] | null;
  thisVsLastMonth: ThisVsLastMonthItem[] | null;
  monthlyTotals: MonthlyTotalsItem[] | null;
  currency: string;
};

function ruleAllBudgetsOnTrack(input: InsightRuleInput): InsightData | null {
  const items = input.budgetPerformance;
  if (!items || items.length === 0) return null;
  const allOnTrack = items.every((item) => item.Actual <= item.Budget);
  if (!allOnTrack) return null;
  return {
    id: "all-budgets-on-track",
    headline: "All budgets on track",
    detail: `${items.length} budget(s) under limit`,
    sentiment: "positive",
  };
}

function ruleOverBudget(input: InsightRuleInput): InsightData | null {
  const items = input.budgetPerformance;
  if (!items || items.length === 0) return null;
  const overItems = items.filter((item) => item.Actual > item.Budget);
  if (overItems.length === 0) return null;
  const worst = overItems.reduce((a, b) =>
    b.Actual - b.Budget > a.Actual - a.Budget ? b : a,
  );
  const overage = worst.Actual - worst.Budget;
  return {
    id: "over-budget",
    headline: `${worst.name} is over budget`,
    detail: `${formatMoney(overage, input.currency)} over limit`,
    sentiment: "warning",
  };
}

function ruleSpendingSpike(input: InsightRuleInput): InsightData | null {
  const items = input.thisVsLastMonth ?? [];
  const candidates = items.filter(
    (item) =>
      item["Last Month"] > 0 && item["This Month"] > item["Last Month"] * 1.2,
  );
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const pctA = (a["This Month"] - a["Last Month"]) / a["Last Month"];
    const pctB = (b["This Month"] - b["Last Month"]) / b["Last Month"];
    return pctB - pctA;
  });
  const top = sorted[0];
  const pct = Math.round(
    ((top["This Month"] - top["Last Month"]) / top["Last Month"]) * 100,
  );
  return {
    id: "spending-spike",
    headline: `Spending on ${top.category} spiked`,
    detail: `Up ${pct}% vs last month`,
    sentiment: "warning",
  };
}

function ruleStrongSavings(input: InsightRuleInput): InsightData | null {
  const totals = input.monthlyTotals;
  if (!totals || totals.length === 0) return null;
  const current = totals[totals.length - 1];
  if (current.Income <= 0) return null;
  const savingsRate = current.Savings / current.Income;
  if (savingsRate < 0.15) return null;
  const pct = Math.round(savingsRate * 100);
  return {
    id: "strong-savings",
    headline: "Great savings this month",
    detail: `You saved ${pct}% of income`,
    sentiment: "positive",
  };
}

function ruleIncomeUp(input: InsightRuleInput): InsightData | null {
  const totals = input.monthlyTotals;
  if (!totals || totals.length < 2) return null;
  const current = totals[totals.length - 1];
  const previous = totals[totals.length - 2];
  if (previous.Income <= 0) return null;
  if (current.Income < previous.Income * 1.05) return null;
  const pct = Math.round(
    ((current.Income - previous.Income) / previous.Income) * 100,
  );
  return {
    id: "income-up",
    headline: "Income up this month",
    detail: `Up ${pct}% from last month`,
    sentiment: "positive",
  };
}

/** Runs all rules against the input and returns fired cards. Empty array = no insights. */
export function computeInsights(input: InsightRuleInput): InsightData[] {
  const rules = [
    ruleAllBudgetsOnTrack,
    ruleOverBudget,
    ruleSpendingSpike,
    ruleStrongSavings,
    ruleIncomeUp,
  ];
  const results: InsightData[] = [];
  for (const rule of rules) {
    const card = rule(input);
    if (card !== null) results.push(card);
  }
  return results;
}
