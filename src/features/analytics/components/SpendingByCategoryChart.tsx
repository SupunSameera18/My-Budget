"use client";

import { DonutChart } from "@tremor/react";
import { formatMoney } from "@/lib/format";
import type { SpendingByCategoryItem } from "@/features/analytics/schema";

interface SpendingByCategoryChartProps {
  data: SpendingByCategoryItem[];
  currency: string;
  scope?: "personal" | "shared" | "combined";
}

export function SpendingByCategoryChart({
  data,
  currency,
}: SpendingByCategoryChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-ink-secondary">
        No expense data for this period.
      </p>
    );
  }

  return (
    <div>
      <DonutChart
        data={data}
        category="value"
        index="name"
        valueFormatter={(v) => formatMoney(v, currency)}
        showLabel={true}
        colors={[
          "teal",
          "indigo",
          "violet",
          "rose",
          "orange",
          "amber",
          "lime",
          "cyan",
        ]}
        className="h-48"
      />
      <ul className="mt-2 space-y-1">
        {data.slice(0, 8).map((item) => (
          <li
            key={item.name}
            className="flex justify-between text-xs text-ink-secondary"
          >
            <span>{item.name}</span>
            <span>{formatMoney(item.value, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
