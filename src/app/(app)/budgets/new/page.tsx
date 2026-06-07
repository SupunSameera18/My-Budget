import Link from "next/link";
import { BudgetForm } from "@/features/budgets/components/BudgetForm";
import { getBudgetFormData } from "@/features/budgets/server/actions";

export default async function NewBudgetPage() {
  const result = await getBudgetFormData();

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-6">
        <Link
          href="/budgets"
          className="text-sm text-ink-secondary hover:text-ink-primary"
        >
          ← Budgets
        </Link>
        <h1 className="mt-2 text-xl font-bold text-ink-primary">
          Create Budget
        </h1>
      </div>

      {result.ok ? (
        <BudgetForm data={result.data} />
      ) : (
        <p className="text-sm text-red-600">
          Unable to load form data. Please try again.
        </p>
      )}
    </div>
  );
}
