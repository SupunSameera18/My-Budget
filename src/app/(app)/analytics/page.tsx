import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/require-user";
import { currentYearMonth, monthBoundaries } from "@/lib/period";
import { CHART_TYPES, isChartEnabled } from "@/features/analytics/schema";
import {
  getChartPreferences,
  getCurrency,
  getSpendingByCategoryData,
  getIncomeVsExpensesData,
  getBudgetPerformanceData,
  getThisVsLastMonthData,
} from "@/features/analytics/server/actions";
import { computeInsights } from "@/lib/analytics/insights";
import { MonthSelector } from "@/features/analytics/components/MonthSelector";
import { InsightsSection } from "@/features/analytics/components/InsightsSection";
import { ChartCard } from "@/features/analytics/components/ChartCard";
import { SpendingByCategoryChart } from "@/features/analytics/components/SpendingByCategoryChart";
import { IncomeVsExpensesChart } from "@/features/analytics/components/IncomeVsExpensesChart";
import { BudgetPerformanceChart } from "@/features/analytics/components/BudgetPerformanceChart";
import { ThisVsLastMonthChart } from "@/features/analytics/components/ThisVsLastMonthChart";
import { EmptyState } from "@/components/feedback/EmptyState";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const auth = await requireUser();
  if (!auth) redirect("/auth/login");

  const params = await searchParams;
  const selectedMonth = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? params.month!
    : currentYearMonth();
  const period = monthBoundaries(selectedMonth);

  const prefs = await getChartPreferences();

  const enabledKeys = CHART_TYPES.filter((c) => isChartEnabled(prefs, c.key));

  if (enabledKeys.length === 0) {
    return (
      <main className="p-4 md:p-6">
        <h1 className="mb-4 text-xl font-bold text-ink-primary">Analytics</h1>
        <EmptyState
          heading="No charts enabled"
          body="Enable charts in Settings → Analytics"
        />
      </main>
    );
  }

  const [spendingData, incomeData, budgetData, thisVsLastData, currency] =
    await Promise.all([
      isChartEnabled(prefs, "spending_by_category")
        ? getSpendingByCategoryData(period)
        : Promise.resolve(null),
      isChartEnabled(prefs, "income_vs_expenses")
        ? getIncomeVsExpensesData(selectedMonth)
        : Promise.resolve(null),
      isChartEnabled(prefs, "budget_performance")
        ? getBudgetPerformanceData()
        : Promise.resolve(null),
      isChartEnabled(prefs, "this_vs_last_month")
        ? getThisVsLastMonthData(selectedMonth)
        : Promise.resolve(null),
      getCurrency(),
    ]);

  const insights = computeInsights({
    budgetPerformance: budgetData,
    thisVsLastMonth: thisVsLastData,
    monthlyTotals: incomeData,
    currency,
  });

  return (
    <main className="p-4 md:p-6">
      <h1 className="mb-4 text-xl font-bold text-ink-primary">Analytics</h1>
      <MonthSelector selectedMonth={selectedMonth} />
      <InsightsSection insights={insights} />
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {isChartEnabled(prefs, "spending_by_category") && (
          <ChartCard
            title="Spending by Category"
            isEmpty={!spendingData?.length}
          >
            <SpendingByCategoryChart
              data={spendingData ?? []}
              currency={currency}
            />
          </ChartCard>
        )}
        {isChartEnabled(prefs, "income_vs_expenses") && (
          <ChartCard title="Income vs Expenses" isEmpty={!incomeData?.length}>
            <IncomeVsExpensesChart
              data={incomeData ?? []}
              currency={currency}
            />
          </ChartCard>
        )}
        {isChartEnabled(prefs, "budget_performance") && (
          <ChartCard
            title="Budget Performance"
            isEmpty={!budgetData?.length}
            emptyMessage="No active budgets."
          >
            <BudgetPerformanceChart
              data={budgetData ?? []}
              currency={currency}
            />
          </ChartCard>
        )}
        {isChartEnabled(prefs, "this_vs_last_month") && (
          <ChartCard
            title="This vs Last Month"
            isEmpty={!thisVsLastData?.length}
          >
            <ThisVsLastMonthChart
              data={thisVsLastData ?? []}
              currency={currency}
            />
          </ChartCard>
        )}
      </div>
    </main>
  );
}
