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
    <div className="h-72">
      <BarChart
        data={data}
        index="category"
        categories={["This Month", "Last Month"]}
        colors={["teal", "slate"]}
        valueFormatter={(v) => formatMoney(v, currency)}
        showLegend={true}
        yAxisWidth={100}
        barCategoryGap="30%"
        className="!h-full"
      />
    </div>
  );
}
