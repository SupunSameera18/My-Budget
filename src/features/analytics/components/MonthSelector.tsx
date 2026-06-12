"use client";

import { useRouter } from "next/navigation";

interface MonthSelectorProps {
  selectedMonth: string; // 'YYYY-MM' — passed from server
}

export function MonthSelector({ selectedMonth }: MonthSelectorProps) {
  const router = useRouter();

  const navigateTo = (month: string) => {
    router.replace(`?month=${month}`);
  };

  const prevMonth = () => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const prev = new Date(Date.UTC(y, m - 2, 1));
    const ym = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
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
        onClick={prevMonth}
        aria-label="Previous month"
        className="flex min-h-[44px] min-w-[44px] items-center justify-center text-ink-secondary hover:text-ink-primary"
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
