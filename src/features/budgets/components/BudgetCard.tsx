import { formatMoney } from "@/lib/format";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { BudgetWithActual } from "@/features/budgets/schema";

interface BudgetCardProps {
  budget: BudgetWithActual;
  currency: string;
}

function periodLabel(budget: BudgetWithActual): string {
  switch (budget.period_type) {
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "yearly":
      return "Yearly";
    case "custom":
      return budget.period_start && budget.period_end
        ? `${budget.period_start} – ${budget.period_end}`
        : "Custom";
  }
}

export function BudgetCard({ budget, currency }: BudgetCardProps) {
  const pct = budget.pct_used;

  return (
    <article className="rounded-xl border border-hairline bg-card p-4 shadow-sm">
      <div className="mb-1 flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-ink-primary">
          {budget.name}
        </h2>
        <span
          className="text-sm font-medium text-ink-primary"
        >
          {pct.toFixed(0)}%
        </span>
      </div>

      <p className="mb-3 text-xs text-ink-secondary">
        {budget.categories.length > 0
          ? `${budget.categories.map((c) => c.name).join(", ")} · `
          : ""}
        {periodLabel(budget)}
      </p>

      <ProgressBar
        pctUsed={pct}
        limitMarker
        ariaLabel={budget.name}
        className="mb-3"
      />

      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-secondary">
          {formatMoney(budget.actual_minor, currency)} of{" "}
          {formatMoney(budget.limit_minor, currency)}
        </span>
        <span
          className="text-ink-primary"
        >
          {budget.remaining_minor >= 0
            ? `${formatMoney(budget.remaining_minor, currency)} left`
            : `${formatMoney(Math.abs(budget.remaining_minor), currency)} over`}
        </span>
      </div>
    </article>
  );
}
