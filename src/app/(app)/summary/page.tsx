import { Suspense } from "react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { getMonthlySummaryData } from "@/features/analytics/server/actions";
import { MonthSelector } from "@/features/analytics/components/MonthSelector";
import { MonthlySummaryContent } from "@/features/analytics/components/MonthlySummaryContent";
import { monthBoundaries, currentMonthBoundaries } from "@/lib/period";

interface PageProps {
  searchParams: Promise<{ month?: string }>;
}

export default async function SummaryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawMonth = params.month;

  const currentYearMonth = (() => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  })();

  const isValidMonth =
    rawMonth &&
    /^\d{4}-(?:0[1-9]|1[0-2])$/.test(rawMonth) &&
    rawMonth <= currentYearMonth;

  const selectedMonth = isValidMonth ? rawMonth : currentYearMonth;
  const period = isValidMonth
    ? monthBoundaries(selectedMonth)
    : currentMonthBoundaries();

  const data = await getMonthlySummaryData(period);

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <EmptyState
          heading="Unable to load summary"
          body="Something went wrong. Please try again later."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-xl font-bold text-ink-primary">
        Monthly Summary
      </h1>
      <Suspense fallback={null}>
        <MonthSelector selectedMonth={selectedMonth} />
      </Suspense>
      <MonthlySummaryContent data={data} />
    </div>
  );
}
