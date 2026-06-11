"use client";

import { BarChart } from "@tremor/react";
import { formatMoney } from "@/lib/format";
import type { BudgetPerformanceItem } from "@/features/analytics/schema";

interface BudgetPerformanceChartProps {
  data: BudgetPerformanceItem[];
  currency: string;
  scope?: "personal" | "shared" | "combined";
}

export function BudgetPerformanceChart({
  data,
  currency,
}: BudgetPerformanceChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-ink-secondary">No active budgets.</p>;
  }

  return (
    <BarChart
      data={data}
      index="name"
      categories={["Budget", "Actual"]}
      colors={["teal", "rose"]}
      valueFormatter={(v) => formatMoney(v, currency)}
      showLegend={true}
      yAxisWidth={80}
      className="h-64"
      layout="vertical"
    />
  );
}
