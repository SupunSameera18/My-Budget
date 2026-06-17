"use client";

import { useState, useTransition } from "react";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/components/feedback/EmptyState";
import {
  currentMonthBoundaries,
  currentMonthEnd,
  currentYearMonth,
  previousYearMonth,
  monthBoundaries,
} from "@/lib/period";
import { getContributionAnalysis } from "@/features/family/server/actions";
import type { ContributionAnalysisData } from "@/features/family/schema";

type Period = "this-month" | "last-3-months" | "all-time";

interface Props {
  initialData: ContributionAnalysisData | null;
  isFamilyMode: boolean;
}

function getPeriodBounds(period: Period): {
  start: string | undefined;
  end: string | undefined;
} {
  const now = new Date();
  if (period === "this-month") {
    const { start, end } = currentMonthBoundaries();
    return { start, end };
  }
  if (period === "last-3-months") {
    // 3-month window: start of the month 2 months ago → end of current month
    const currentYM = currentYearMonth(now);
    const twoBack = previousYearMonth(previousYearMonth(currentYM));
    const { start } = monthBoundaries(twoBack);
    return { start, end: currentMonthEnd(now) };
  }
  return { start: undefined, end: undefined };
}

const PERIOD_LABELS: Record<Period, string> = {
  "this-month": "This month",
  "last-3-months": "Last 3 months",
  "all-time": "All time",
};

export function ContributionAnalysis({ initialData, isFamilyMode }: Props) {
  const [data, setData] = useState(initialData);
  const [period, setPeriod] = useState<Period>("this-month");
  const [errorMsg, setErrorMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  const handlePeriodChange = (newPeriod: Period) => {
    if (newPeriod === period) return;
    setPeriod(newPeriod);
    setErrorMsg("");

    const { start, end } = getPeriodBounds(newPeriod);
    startTransition(async () => {
      const result = await getContributionAnalysis(start, end);
      if (result === null) {
        setData(null);
        setErrorMsg("Could not load contribution data. Please try again.");
      } else {
        setData(result);
      }
    });
  };

  const isEmpty =
    !data ||
    (data.contributions[0].transactionCount === 0 &&
      data.contributions[1].transactionCount === 0 &&
      data.contributions[0].goalContributionMinor === 0 &&
      data.contributions[1].goalContributionMinor === 0);

  return (
    <>
      {/* aria-live always mounted for error announcements (§9 / dev-learnings §17) */}
      <div
        aria-live="polite"
        role="status"
        className="sr-only"
        aria-atomic="true"
      >
        {errorMsg}
      </div>

      <section
        aria-labelledby="contribution-analysis-heading"
        hidden={!isFamilyMode}
        className="mt-8"
      >
        <h2
          id="contribution-analysis-heading"
          className="mb-4 text-base font-medium text-ink-primary"
        >
          Contribution Analysis
        </h2>

        {/* Period selector — role="radiogroup" per AC 24 */}
        <div
          role="radiogroup"
          aria-label="Analysis period"
          className="bg-ink-secondary/10 mb-4 flex gap-1 rounded-lg p-1"
        >
          {(["this-month", "last-3-months", "all-time"] as Period[]).map(
            (p) => (
              <button
                key={p}
                role="radio"
                aria-checked={period === p}
                onClick={() => handlePeriodChange(p)}
                disabled={isPending}
                aria-disabled={isPending ? "true" : undefined}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  period === p
                    ? "bg-card text-ink-primary shadow-sm"
                    : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ),
          )}
        </div>

        {period === "this-month" && !isEmpty && (
          <p className="mb-2 text-xs text-ink-secondary">
            Partial month — updates as you log.
          </p>
        )}
        {isEmpty ? (
          <EmptyState
            heading="No shared expenses"
            body="Log a shared transaction to see contribution breakdown."
          />
        ) : (
          <table
            className={`w-full text-sm transition-opacity ${isPending ? "opacity-50" : "opacity-100"}`}
          >
            <caption className="sr-only">Contribution breakdown</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="pb-2 text-left font-medium text-ink-secondary"
                >
                  {data!.contributions[0].displayName}
                </th>
                <th
                  scope="col"
                  className="pb-2 text-right font-medium text-ink-secondary"
                >
                  {data!.contributions[1].displayName}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1 text-left font-semibold text-ink-primary">
                  {formatMoney(
                    data!.contributions[0].totalPaidMinor,
                    data!.currency,
                  )}
                </td>
                <td className="py-1 text-right font-semibold text-ink-primary">
                  {formatMoney(
                    data!.contributions[1].totalPaidMinor,
                    data!.currency,
                  )}
                </td>
              </tr>
              <tr>
                <td className="py-1 text-left text-ink-secondary">
                  {data!.contributions[0].transactionCount} transactions
                </td>
                <td className="py-1 text-right text-ink-secondary">
                  {data!.contributions[1].transactionCount} transactions
                </td>
              </tr>
              {(data!.contributions[0].goalContributionMinor > 0 ||
                data!.contributions[1].goalContributionMinor > 0) && (
                <tr>
                  <td className="pt-2 text-left text-xs text-ink-secondary">
                    Goal contributions:{" "}
                    {formatMoney(
                      data!.contributions[0].goalContributionMinor,
                      data!.currency,
                    )}
                  </td>
                  <td className="pt-2 text-right text-xs text-ink-secondary">
                    Goal contributions:{" "}
                    {formatMoney(
                      data!.contributions[1].goalContributionMinor,
                      data!.currency,
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {errorMsg && (
          <p className="mt-2 text-xs text-red-500" aria-hidden="true">
            {errorMsg}
          </p>
        )}
      </section>
    </>
  );
}
