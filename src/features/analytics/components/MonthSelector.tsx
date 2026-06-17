"use client";

import { useRouter, useSearchParams } from "next/navigation";

/** Earliest month navigable in MonthSelector — prevents unbounded backward navigation. */
const MIN_MONTH = "2020-01";

interface MonthSelectorProps {
  selectedMonth: string; // 'YYYY-MM' — passed from server
}

export function MonthSelector({ selectedMonth }: MonthSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const navigateTo = (month: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", month);
    router.replace(`?${params.toString()}`);
  };

  const prevMonth = () => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const prev = new Date(Date.UTC(y, m - 2, 1));
    const ym = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
    if (ym < MIN_MONTH) return;
    navigateTo(ym);
  };

  const nextMonth = () => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const next = new Date(Date.UTC(y, m, 1));
    const ym = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
    navigateTo(ym);
  };

  const isCurrentMonth = (() => {
    const now = new Date();
    const curr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    return selectedMonth >= curr;
  })();

  const isFirstMonth = selectedMonth <= MIN_MONTH;

  const [y, m] = selectedMonth.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="mb-4 flex items-center justify-between">
      <button
        type="button"
        onClick={isFirstMonth ? undefined : prevMonth}
        disabled={isFirstMonth}
        aria-label="Previous month"
        aria-disabled={isFirstMonth}
        className={`flex min-h-[44px] min-w-[44px] items-center justify-center ${
          isFirstMonth
            ? "text-ink-secondary/40 cursor-not-allowed"
            : "text-ink-secondary hover:text-ink-primary"
        }`}
      >
        ←
      </button>
      <span className="text-base font-semibold text-ink-primary">{label}</span>
      <button
        type="button"
        onClick={isCurrentMonth ? undefined : nextMonth}
        disabled={isCurrentMonth}
        aria-label="Next month"
        aria-disabled={isCurrentMonth}
        className={`flex min-h-[44px] min-w-[44px] items-center justify-center ${
          isCurrentMonth
            ? "text-ink-secondary/40 cursor-not-allowed"
            : "text-ink-secondary hover:text-ink-primary"
        }`}
      >
        →
      </button>
    </div>
  );
}
