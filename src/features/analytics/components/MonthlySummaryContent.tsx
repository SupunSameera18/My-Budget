import { formatMoney } from "@/lib/format";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { EmptyState } from "@/components/feedback/EmptyState";
import { HealthScoreDisplay } from "./HealthScoreDisplay";
import type { MonthlySummaryData } from "@/features/analytics/server/actions";

interface MonthlySummaryContentProps {
  data: MonthlySummaryData;
}

export function MonthlySummaryContent({ data }: MonthlySummaryContentProps) {
  const {
    currency,
    incomeMinor,
    expenseMinor,
    netMinor,
    topCategories,
    budgets,
    goals,
    healthScore,
  } = data;
  const isNegativeNet = netMinor < 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Net Result */}
      <section
        aria-label="Net result"
        className="rounded-xl border border-hairline bg-card p-4 shadow-sm"
      >
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Net Result
        </h2>
        <div role="status" aria-live="polite">
          <p
            className={`text-4xl font-bold ${isNegativeNet ? "text-breathing-low-text" : "text-ink-primary"}`}
            style={{
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.8px",
            }}
          >
            {formatMoney(netMinor, currency)}
          </p>
        </div>
        <p className="mt-1 text-sm text-ink-secondary">
          {formatMoney(incomeMinor, currency)} in ·{" "}
          {formatMoney(expenseMinor, currency)} out
        </p>
      </section>

      {/* Health Score — only rendered when score data is available; HealthScoreDisplay owns its own section landmark */}
      {healthScore && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-ink-secondary">
            Financial Health
          </h2>
          <HealthScoreDisplay result={healthScore} />
        </div>
      )}

      {/* Top Spending */}
      <section
        aria-label="Top spending"
        className="rounded-xl border border-hairline bg-card p-4 shadow-sm"
      >
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Top Spending
        </h2>
        {topCategories.length === 0 ? (
          <EmptyState
            heading="No spending recorded"
            body="No spending recorded this month"
          />
        ) : (
          <ul className="space-y-2">
            {topCategories.map((cat) => (
              <li key={cat.name} className="flex items-center justify-between">
                <span className="text-sm text-ink-primary">{cat.name}</span>
                <span className="text-sm font-medium text-ink-primary">
                  {formatMoney(cat.amountMinor, currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Budget Performance */}
      <section
        aria-label="Budget performance"
        className="rounded-xl border border-hairline bg-card p-4 shadow-sm"
      >
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Budget Performance
        </h2>
        {budgets.length === 0 ? (
          <EmptyState
            heading="No budgets"
            body="No budgets set for this period"
          />
        ) : (
          <ul className="space-y-4">
            {budgets.map((b) => (
              <li key={b.id}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-ink-primary">
                    {b.name}
                  </span>
                  <span
                    className={`text-xs font-semibold ${b.hit ? "text-amber-500" : "text-ink-secondary"}`}
                  >
                    {b.hit ? "Over budget" : "On track"}
                  </span>
                </div>
                <ProgressBar
                  pctUsed={b.pctUsed}
                  noAmber={false}
                  ariaLabel={`${b.name} usage`}
                />
                <p className="mt-1 text-xs text-ink-secondary">
                  {formatMoney(b.actualMinor, currency)} of{" "}
                  {formatMoney(b.limitMinor, currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Goal Progress */}
      <section
        aria-label="Goal progress"
        className="rounded-xl border border-hairline bg-card p-4 shadow-sm"
      >
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Goal Progress
        </h2>
        {goals.length === 0 ? (
          <EmptyState heading="No goals" body="No goals set up yet" />
        ) : (
          <ul className="space-y-4">
            {goals.map((g) => (
              <li key={g.id}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-ink-primary">
                    {g.name}
                  </span>
                  <span className="text-xs text-ink-secondary">
                    {Math.round(g.pctUsed)}%
                  </span>
                </div>
                <ProgressBar
                  pctUsed={g.pctUsed}
                  noAmber={true}
                  ariaLabel={`${g.name} progress`}
                />
                <p className="mt-1 text-xs text-ink-secondary">
                  {formatMoney(g.currentMinor, currency)} of{" "}
                  {formatMoney(g.target_minor, currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
