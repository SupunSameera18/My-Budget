"use client";

import { BarChart } from "@tremor/react";
import { formatMoney } from "@/lib/format";
import type { MonthlyTotalsItem } from "@/features/analytics/schema";

interface IncomeVsExpensesChartProps {
  data: MonthlyTotalsItem[];
  currency: string;
  scope?: "personal" | "shared" | "combined";
}

export function IncomeVsExpensesChart({
  data,
  currency,
}: IncomeVsExpensesChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-ink-secondary">
        No income or expense data for this period.
      </p>
    );
  }

  return (
    <BarChart
      data={data}
      index="month"
      categories={["Income", "Savings", "Expenses"]}
      colors={["teal", "indigo", "rose"]}
      valueFormatter={(v) => formatMoney(v, currency)}
      showLegend={true}
      yAxisWidth={80}
      className="h-64"
    />
  );
}
