"use server";

import { requireUser } from "@/lib/supabase/require-user";
import {
  currentMonthBoundaries,
  monthBoundaries,
  last6YearMonths,
  previousYearMonth,
} from "@/lib/period";
import { err, ok, ErrorCode, type Result } from "@/lib/errors";
import {
  type ChartPreferences,
  type SpendingByCategoryItem,
  type MonthlyTotalsItem,
  type BudgetPerformanceItem,
  type ThisVsLastMonthItem,
} from "@/features/analytics/schema";
import type { HealthScoreResult } from "@/lib/money/health-score";
import { getGoals } from "@/features/goals/server/actions";
import type { GoalWithProgress } from "@/features/goals/schema";
import { getBudgets } from "@/features/budgets/server/actions";

export async function getChartPreferences(): Promise<ChartPreferences> {
  const session = await requireUser();
  if (!session) return {};

  const { supabase, user } = session;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("chart_preferences")
      .eq("user_id", user.id)
      .single();
    if (error) return {};
    return (data?.chart_preferences as ChartPreferences) ?? {};
  } catch {
    return {};
  }
}

export async function saveChartPreferences(
  prefs: ChartPreferences,
): Promise<Result<void>> {
  const session = await requireUser();
  if (!session) return err(ErrorCode.ProfileUpdateFailed, "Not authenticated");

  const { supabase, user } = session;
  try {
    const { error } = await supabase
      .from("profiles")
      .update({
        chart_preferences: prefs,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (error) return err(ErrorCode.ProfileUpdateFailed, error.message);
    return ok();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return err(ErrorCode.ProfileUpdateFailed, msg);
  }
}

export async function getHealthScore(period?: {
  start: string;
  end: string;
}): Promise<HealthScoreResult | null> {
  const session = await requireUser();
  if (!session) return null;
  const { supabase } = session;

  const { start, end } = period ?? currentMonthBoundaries();

  try {
    const { data, error } = await supabase.rpc("rpc_get_health_score", {
      p_period_start: start,
      p_period_end: end,
    });
    if (error || !data?.[0]) return null;
    return {
      score: data[0].score,
      confidencePercent: data[0].confidence_percent,
      hasEnoughData: data[0].has_enough_data,
    };
  } catch {
    return null;
  }
}

export type MonthlySummaryData = {
  period: { start: string; end: string };
  currency: string;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  topCategories: Array<{ name: string; amountMinor: number }>;
  budgets: Array<{
    id: string;
    name: string;
    limitMinor: number;
    actualMinor: number;
    pctUsed: number;
    hit: boolean;
  }>;
  goals: GoalWithProgress[];
  healthScore: HealthScoreResult | null;
};

export async function getMonthlySummaryData(period: {
  start: string;
  end: string;
}): Promise<MonthlySummaryData | null> {
  const session = await requireUser();
  if (!session) return null;
  const { supabase, user } = session;

  try {
    const [txnsResult, budgetsResult, goalsResult, profileResult, healthScore] =
      await Promise.all([
        supabase
          .from("transactions")
          .select("amount_minor, type, category_id, categories(name)")
          .eq("user_id", user.id)
          .gte("date", period.start)
          .lte("date", period.end)
          .is("archived_at", null)
          .in("type", ["income", "expense"]),
        supabase
          .from("budgets")
          .select("id, name, limit_minor, budget_categories(category_id)")
          .eq("user_id", user.id)
          .is("archived_at", null),
        getGoals(),
        supabase
          .from("profiles")
          .select("currency")
          .eq("user_id", user.id)
          .single(),
        getHealthScore(period),
      ]);

    if (txnsResult.error || budgetsResult.error || profileResult.error)
      return null;

    const currency = profileResult.data!.currency;
    const txns = txnsResult.data ?? [];
    const budgetRows = budgetsResult.data ?? [];

    const incomeMinor = txns
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount_minor, 0);
    const expenseMinor = txns
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount_minor, 0);
    const netMinor = incomeMinor - expenseMinor;

    // Group by category_id (not name) to correctly aggregate if two categories share a display name
    const catMap = new Map<string, { name: string; amountMinor: number }>();
    for (const t of txns.filter((t) => t.type === "expense")) {
      const catName =
        (t.categories as unknown as { name: string } | null)?.name ??
        "Uncategorized";
      const existing = catMap.get(t.category_id);
      catMap.set(t.category_id, {
        name: catName,
        amountMinor: (existing?.amountMinor ?? 0) + t.amount_minor,
      });
    }
    const topCategories = [...catMap.values()]
      .sort((a, b) => b.amountMinor - a.amountMinor)
      .slice(0, 3)
      .map(({ name, amountMinor }) => ({ name, amountMinor }));

    const expenseTxns = txns.filter((t) => t.type === "expense");
    const budgets = budgetRows.map((b) => {
      const categorySet = new Set(
        ((b.budget_categories ?? []) as Array<{ category_id: string }>).map(
          (bc) => bc.category_id,
        ),
      );
      const actualMinor = expenseTxns
        .filter((t) => categorySet.has(t.category_id))
        .reduce((sum, t) => sum + t.amount_minor, 0);
      const pctUsed =
        b.limit_minor > 0 ? (actualMinor / b.limit_minor) * 100 : 0;
      return {
        id: b.id,
        name: b.name,
        limitMinor: b.limit_minor,
        actualMinor,
        pctUsed,
        hit: actualMinor >= b.limit_minor,
      };
    });

    const goals = goalsResult.ok ? goalsResult.data.goals : [];

    return {
      period,
      currency,
      incomeMinor,
      expenseMinor,
      netMinor,
      topCategories,
      budgets,
      goals,
      healthScore,
    };
  } catch {
    return null;
  }
}

export async function getCurrency(): Promise<string> {
  const session = await requireUser();
  if (!session) return "USD";
  const { supabase, user } = session;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("currency")
      .eq("user_id", user.id)
      .single();
    if (error || !data) return "USD";
    return data.currency ?? "USD";
  } catch {
    return "USD";
  }
}

export async function getSpendingByCategoryData(period: {
  start: string;
  end: string;
}): Promise<SpendingByCategoryItem[] | null> {
  const session = await requireUser();
  if (!session) return null;
  const { supabase, user } = session;
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select("amount_minor, category_id, categories(name)")
      .eq("user_id", user.id)
      .eq("type", "expense")
      .gte("date", period.start)
      .lte("date", period.end)
      .is("archived_at", null);
    if (error) return null;
    const grouped = new Map<string, number>();
    for (const t of data ?? []) {
      const name =
        (t.categories as unknown as { name: string } | null)?.name ??
        "Uncategorized";
      grouped.set(name, (grouped.get(name) ?? 0) + t.amount_minor);
    }
    return Array.from(grouped.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  } catch {
    return null;
  }
}

export async function getIncomeVsExpensesData(
  yearMonth: string,
): Promise<MonthlyTotalsItem[] | null> {
  const session = await requireUser();
  if (!session) return null;
  const { supabase, user } = session;
  try {
    const months = last6YearMonths(yearMonth);
    const start = monthBoundaries(months[0]).start;
    const end = monthBoundaries(yearMonth).end;
    const { data, error } = await supabase
      .from("transactions")
      .select("amount_minor, date, type")
      .eq("user_id", user.id)
      .gte("date", start)
      .lte("date", end)
      .is("archived_at", null)
      .in("type", ["income", "expense"]);
    if (error) return null;
    const grouped = new Map(months.map((m) => [m, { income: 0, expense: 0 }]));
    for (const t of data ?? []) {
      const m = (t.date as string).slice(0, 7);
      const g = grouped.get(m);
      if (!g) continue;
      if (t.type === "income") g.income += t.amount_minor;
      else g.expense += t.amount_minor;
    }
    return months.map((m) => {
      const g = grouped.get(m)!;
      return {
        month: new Date(m + "-15").toLocaleDateString("en-US", {
          month: "short",
          timeZone: "UTC",
        }),
        Income: g.income,
        Savings: Math.max(0, g.income - g.expense),
        Expenses: g.expense,
      };
    });
  } catch {
    return null;
  }
}

export async function getBudgetPerformanceData(): Promise<
  BudgetPerformanceItem[] | null
> {
  try {
    const result = await getBudgets();
    if (!result.ok) return null;
    return result.data.map((b) => ({
      name: b.name,
      Budget: b.limit_minor,
      Actual: b.actual_minor,
    }));
  } catch {
    return null;
  }
}

export async function getThisVsLastMonthData(
  yearMonth: string,
): Promise<ThisVsLastMonthItem[] | null> {
  const session = await requireUser();
  if (!session) return null;
  const { supabase, user } = session;
  try {
    const prevMonth = previousYearMonth(yearMonth);
    const current = monthBoundaries(yearMonth);
    const prev = monthBoundaries(prevMonth);

    const [currentResult, prevResult] = await Promise.all([
      supabase
        .from("transactions")
        .select("amount_minor, category_id, categories(name)")
        .eq("user_id", user.id)
        .eq("type", "expense")
        .gte("date", current.start)
        .lte("date", current.end)
        .is("archived_at", null),
      supabase
        .from("transactions")
        .select("amount_minor, category_id, categories(name)")
        .eq("user_id", user.id)
        .eq("type", "expense")
        .gte("date", prev.start)
        .lte("date", prev.end)
        .is("archived_at", null),
    ]);

    if (currentResult.error || prevResult.error) return null;

    const buildMap = (rows: typeof currentResult.data) => {
      const m = new Map<string, number>();
      for (const t of rows ?? []) {
        const name =
          (t.categories as unknown as { name: string } | null)?.name ??
          "Uncategorized";
        m.set(name, (m.get(name) ?? 0) + t.amount_minor);
      }
      return m;
    };

    const currentByCat = buildMap(currentResult.data);
    const prevByCat = buildMap(prevResult.data);

    const allCategories = new Set([
      ...currentByCat.keys(),
      ...prevByCat.keys(),
    ]);

    const items: ThisVsLastMonthItem[] = Array.from(allCategories).map(
      (cat) => ({
        category: cat,
        "This Month": currentByCat.get(cat) ?? 0,
        "Last Month": prevByCat.get(cat) ?? 0,
      }),
    );

    items.sort((a, b) => b["This Month"] - a["This Month"]);
    return items.slice(0, 8);
  } catch {
    return null;
  }
}
