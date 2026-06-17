import Link from "next/link";
import { EmptyState } from "@/components/feedback/EmptyState";
import { BudgetCard } from "@/features/budgets/components/BudgetCard";
import { getBudgets, getUserCurrency } from "@/features/budgets/server/actions";

export default async function BudgetsPage() {
  const [budgetsResult, currency] = await Promise.all([
    getBudgets(),
    getUserCurrency(),
  ]);

  const budgets = budgetsResult.ok ? budgetsResult.data : [];

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink-primary">Budgets</h1>
        <Link
          href="/budgets/new"
          className="inline-flex min-h-[44px] items-center rounded-md bg-brand-accent-strong px-4 py-2 text-sm font-semibold text-brand-on-accent hover:opacity-90 active:opacity-80"
        >
          Create Budget
        </Link>
      </div>

      {budgets.length === 0 ? (
        <EmptyState
          heading="No budgets yet"
          body="Create a budget to track your spending against a limit."
          actionLabel="Create Budget"
          actionHref="/budgets/new"
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {budgets.map((budget) => (
            <li key={budget.id}>
              <BudgetCard budget={budget} currency={currency} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
