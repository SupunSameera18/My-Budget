import { createClient } from "@/lib/supabase/server";
import { CategoryCard } from "@/features/categories/components/CategoryCard";
import { CreateCategoryForm } from "@/features/categories/components/CreateCategoryForm";
import type { Category } from "@/features/categories/schema";

type CategoryWithCount = Category & { transactions: { count: number }[] };

export default async function CategoriesPage() {
  const supabase = await createClient();

  const { data: activeRaw } = await supabase
    .from("categories")
    .select("*, transactions(count)")
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  const activeCategories = (activeRaw ?? []).map((c) => ({
    ...(c as CategoryWithCount),
    hasHistory: ((c as CategoryWithCount).transactions[0]?.count ?? 0) > 0,
  }));

  const incomeCategories = activeCategories.filter((c) => c.type === "income");
  const expenseCategories = activeCategories.filter(
    (c) => c.type === "expense",
  );

  const { data: archivedRaw } = await supabase
    .from("categories")
    .select("*, transactions(count)")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  const archivedCategories = (archivedRaw ?? []).map((c) => ({
    ...(c as CategoryWithCount),
    hasHistory: ((c as CategoryWithCount).transactions[0]?.count ?? 0) > 0,
  }));

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-6 text-xl font-bold text-ink-primary">Categories</h1>

      {/* Income section */}
      <section aria-labelledby="income-heading" className="mb-6">
        <h2
          id="income-heading"
          className="mb-3 text-base font-semibold text-ink-primary"
        >
          Income
        </h2>
        {incomeCategories.length > 0 ? (
          <ul className="flex flex-col gap-3" aria-label="Income categories">
            {incomeCategories.map((c) => (
              <li key={c.id}>
                <CategoryCard
                  category={c}
                  hasHistory={c.hasHistory}
                  isArchived={false}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-secondary">
            No active income categories. Add one below.
          </p>
        )}
      </section>

      {/* Expense section */}
      <section aria-labelledby="expense-heading" className="mb-6">
        <h2
          id="expense-heading"
          className="mb-3 text-base font-semibold text-ink-primary"
        >
          Expenses
        </h2>
        {expenseCategories.length > 0 ? (
          <ul className="flex flex-col gap-3" aria-label="Expense categories">
            {expenseCategories.map((c) => (
              <li key={c.id}>
                <CategoryCard
                  category={c}
                  hasHistory={c.hasHistory}
                  isArchived={false}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-secondary">
            No active expense categories. Add one below.
          </p>
        )}
      </section>

      {/* Archived section — only shown when at least one exists */}
      {archivedCategories.length > 0 && (
        <section aria-labelledby="archived-categories-heading" className="mb-8">
          <h2
            id="archived-categories-heading"
            className="mb-3 text-base font-semibold text-ink-secondary"
          >
            Archived categories
          </h2>
          <ul className="flex flex-col gap-3" aria-label="Archived categories">
            {archivedCategories.map((c) => (
              <li key={c.id}>
                <CategoryCard
                  category={c}
                  hasHistory={c.hasHistory}
                  isArchived={true}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Add category form */}
      <section aria-labelledby="add-category-heading" className="mb-8">
        <h2
          id="add-category-heading"
          className="mb-4 text-base font-semibold text-ink-primary"
        >
          Add category
        </h2>
        <CreateCategoryForm />
      </section>
    </div>
  );
}
