"use client";

import { DonutChart } from "@tremor/react";
import { formatMoney } from "@/lib/format";
import type { SpendingByCategoryItem } from "@/features/analytics/schema";

interface SpendingByCategoryChartProps {
  data: SpendingByCategoryItem[];
  currency: string;
  scope?: "personal" | "shared" | "combined";
}

const CHART_COLORS = [
  "teal",
  "indigo",
  "violet",
  "rose",
  "orange",
  "amber",
  "lime",
  "cyan",
] as const;

// Hex values matching Tailwind's 500 shade for each Tremor color name above
const SWATCH_HEX = [
  "#14b8a6",
  "#6366f1",
  "#8b5cf6",
  "#f43f5e",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#06b6d4",
];

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
        colors={[...CHART_COLORS]}
        className="h-48"
      />
      <ul className="mt-2 space-y-1">
        {data.slice(0, 8).map((item, i) => (
          <li
            key={item.name}
            className="flex items-center justify-between text-xs text-ink-secondary"
          >
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: SWATCH_HEX[i] }}
              />
              {item.name}
            </span>
            <span>{formatMoney(item.value, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
