"use server";

import { requireUser } from "@/lib/supabase/require-user";
import { currentMonthBoundaries } from "@/lib/period";
import { err, ok, ErrorCode, type Result } from "@/lib/errors";
import { type ChartPreferences } from "@/features/analytics/schema";
import type { HealthScoreResult } from "@/lib/money/health-score";
import { getGoals } from "@/features/goals/server/actions";
import type { GoalWithProgress } from "@/features/goals/schema";

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
