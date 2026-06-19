import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Monthly Summary" };
import { EmptyState } from "@/components/feedback/EmptyState";
import { getMonthlySummaryData } from "@/features/analytics/server/actions";
import { MonthSelector } from "@/features/analytics/components/MonthSelector";
import { MonthlySummaryContent } from "@/features/analytics/components/MonthlySummaryContent";
import { ExportCsvButton } from "@/features/analytics/components/ExportCsvButton";
import { ExportPdfButton } from "@/features/analytics/components/ExportPdfButton";
import { ScopeSegmentedControl } from "@/components/ui/ScopeSegmentedControl";
import { monthBoundaries, currentMonthBoundaries } from "@/lib/period";
import { getFamilyStatus } from "@/features/family/server/actions";
import type { Scope } from "@/features/analytics/schema";
import { VALID_SCOPES } from "@/features/analytics/schema";

interface PageProps {
  searchParams: Promise<{ month?: string; scope?: string }>;
}

export default async function SummaryPage({ searchParams }: PageProps) {
  const [params, familyStatus] = await Promise.all([
    searchParams,
    getFamilyStatus(),
  ]);

  const isFamilyMode = familyStatus.status === "in_family";

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

  const scope: Scope =
    isFamilyMode && VALID_SCOPES.includes(params.scope as Scope)
      ? (params.scope as Scope)
      : "combined";

  const data = await getMonthlySummaryData(period, scope);

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
      <Suspense fallback={null}>
        <ScopeSegmentedControl
          isFamilyMode={isFamilyMode}
          basePath="/summary"
        />
      </Suspense>
      <MonthlySummaryContent data={data} />
      <div className="mt-4 flex flex-wrap gap-2">
        <ExportCsvButton
          period={period}
          currency={data.currency}
          selectedMonth={selectedMonth}
          scope={scope}
        />
        <ExportPdfButton
          period={period}
          selectedMonth={selectedMonth}
          scope={scope}
        />
      </div>
    </div>
  );
}
