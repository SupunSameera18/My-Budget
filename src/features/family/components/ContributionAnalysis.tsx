import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/components/feedback/EmptyState";
import type { ContributionAnalysisData } from "@/features/family/schema";

interface Props {
  initialData: ContributionAnalysisData | null;
  isFamilyMode: boolean;
  partnerName?: string;
  lastSettledAt?: string | null;
}

function formatSettleDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ContributionAnalysis({
  initialData,
  isFamilyMode,
  partnerName,
  lastSettledAt,
}: Props) {
  const isEmpty =
    !initialData ||
    (initialData.contributions[0].transactionCount === 0 &&
      initialData.contributions[1].transactionCount === 0 &&
      initialData.contributions[0].goalContributionMinor === 0 &&
      initialData.contributions[1].goalContributionMinor === 0);

  const periodLabel = lastSettledAt
    ? `Since ${formatSettleDate(lastSettledAt)}`
    : "All time";

  return (
    <>
      {/* aria-live always mounted for error announcements (§9 / dev-learnings §17) */}
      <div
        aria-live="polite"
        role="status"
        className="sr-only"
        aria-atomic="true"
      />

      <section
        aria-labelledby="contribution-analysis-heading"
        hidden={!isFamilyMode}
        className="mt-8"
      >
        <h2
          id="contribution-analysis-heading"
          className="mb-1 text-base font-medium text-ink-primary"
        >
          Contribution Analysis
        </h2>

        <p className="mb-4 text-xs text-ink-secondary">{periodLabel}</p>

        {isEmpty ? (
          <EmptyState
            heading="No shared expenses"
            body="Log a shared transaction to see contribution breakdown."
          />
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Contribution breakdown</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="pb-2 text-left font-medium text-ink-secondary"
                >
                  {initialData!.contributions[0].displayName}
                </th>
                <th
                  scope="col"
                  className="pb-2 text-right font-medium text-ink-secondary"
                >
                  {partnerName ?? initialData!.contributions[1].displayName}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1 text-left font-semibold text-ink-primary">
                  {formatMoney(
                    initialData!.contributions[0].totalPaidMinor,
                    initialData!.currency,
                  )}
                </td>
                <td className="py-1 text-right font-semibold text-ink-primary">
                  {formatMoney(
                    initialData!.contributions[1].totalPaidMinor,
                    initialData!.currency,
                  )}
                </td>
              </tr>
              <tr>
                <td className="py-1 text-left text-ink-secondary">
                  {initialData!.contributions[0].transactionCount} transactions
                </td>
                <td className="py-1 text-right text-ink-secondary">
                  {initialData!.contributions[1].transactionCount} transactions
                </td>
              </tr>
              {(initialData!.contributions[0].goalContributionMinor > 0 ||
                initialData!.contributions[1].goalContributionMinor > 0) && (
                <tr>
                  <td className="pt-2 text-left text-xs text-ink-secondary">
                    Goal contributions:{" "}
                    {formatMoney(
                      initialData!.contributions[0].goalContributionMinor,
                      initialData!.currency,
                    )}
                  </td>
                  <td className="pt-2 text-right text-xs text-ink-secondary">
                    Goal contributions:{" "}
                    {formatMoney(
                      initialData!.contributions[1].goalContributionMinor,
                      initialData!.currency,
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
