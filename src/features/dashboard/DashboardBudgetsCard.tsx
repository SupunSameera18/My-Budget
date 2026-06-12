import Link from "next/link";
import { requireUser } from "@/lib/supabase/require-user";
import { getBudgets } from "@/features/budgets/server/actions";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { formatMoney } from "@/lib/format";

export async function DashboardBudgetsCard() {
  const auth = await requireUser();
  if (!auth) return null;
  const { supabase, user } = auth;

  const [budgetsResult, profileRes] = await Promise.all([
    getBudgets(),
    supabase
      .from("profiles")
      .select("currency")
      .eq("user_id", user.id)
      .single(),
  ]);

  if (!budgetsResult.ok) return null;

  const currency = profileRes.data?.currency ?? "USD";
  const allBudgets = budgetsResult.data;
  const totalBudgets = allBudgets.length;

  if (totalBudgets === 0) {
    return (
      <section
        aria-label="Budgets"
        className="rounded-xl border border-hairline bg-card p-4 shadow-sm"
      >
        <h2 className="mb-2 text-base font-bold text-ink-primary">Budgets</h2>
        <p className="text-sm text-ink-secondary">
          No budgets yet.{" "}
          <Link
            href="/budgets/new"
            className="text-brand-accent-strong underline"
          >
            Create one
          </Link>{" "}
          to track your spending.
        </p>
      </section>
    );
  }

  const displayBudgets = [...allBudgets]
    .sort((a, b) => b.pct_used - a.pct_used || a.name.localeCompare(b.name))
    .slice(0, 3);

  return (
    <section
      aria-label="Budgets"
      className="rounded-xl border border-hairline bg-card p-4 shadow-sm"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-ink-primary">Budgets</h2>
        <Link
          href="/budgets"
          className="text-xs text-ink-secondary hover:text-ink-primary"
        >
          See all →
        </Link>
      </div>
      <div className="flex flex-col gap-3">
        {displayBudgets.map((budget) => (
          <div key={budget.id}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="truncate font-medium text-ink-primary">
                {budget.name}
              </span>
              <span
                className="ml-2 shrink-0 tabular-nums text-ink-secondary"
              >
                {budget.remaining_minor <= 0
                  ? `${formatMoney(Math.abs(budget.remaining_minor), currency)} over`
                  : `${formatMoney(budget.remaining_minor, currency)} left`}
              </span>
            </div>
            <ProgressBar pctUsed={budget.pct_used} limitMarker={true} />
          </div>
        ))}
      </div>
      {totalBudgets > 3 && (
        <p className="mt-3 text-xs text-ink-secondary">
          +{totalBudgets - 3} more ·{" "}
          <Link href="/budgets" className="underline">
            See all
          </Link>
        </p>
      )}
    </section>
  );
}
