"use client";

import { BarChart } from "@tremor/react";
import { formatMoney } from "@/lib/format";
import type { ThisVsLastMonthItem } from "@/features/analytics/schema";

interface ThisVsLastMonthChartProps {
  data: ThisVsLastMonthItem[];
  currency: string;
  scope?: "personal" | "shared" | "combined";
}

export function ThisVsLastMonthChart({
  data,
  currency,
}: ThisVsLastMonthChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-ink-secondary">
        No expense data for this period.
      </p>
    );
  }

  return (
    <BarChart
      data={data}
      index="category"
      categories={["This Month", "Last Month"]}
      colors={["teal", "slate"]}
      valueFormatter={(v) => formatMoney(v, currency)}
      showLegend={true}
      yAxisWidth={80}
      className="h-64"
      layout="vertical"
    />
  );
}
