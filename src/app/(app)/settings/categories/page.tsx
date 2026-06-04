import { createClient } from "@/lib/supabase/server";
import { CategoryCard } from "@/features/categories/components/CategoryCard";
import { CreateCategoryForm } from "@/features/categories/components/CreateCategoryForm";
import { SubcategoryToggle } from "@/features/categories/components/SubcategoryToggle";
import { SubcategoryRow } from "@/features/categories/components/SubcategoryRow";
import { CreateSubcategoryForm } from "@/features/categories/components/CreateSubcategoryForm";
import type { Category, Subcategory } from "@/features/categories/schema";

type CategoryWithCount = Category & { transactions: { count: number }[] };
type SubcategoryWithCount = Subcategory & { transactions: { count: number }[] };

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

  // Fetch subcategories toggle state
  const { data: profileData } = await supabase
    .from("profiles")
    .select("subcategories_enabled")
    .limit(1)
    .single();

  const subcategoriesEnabled = profileData?.subcategories_enabled ?? false;

  // Fetch active subcategories grouped by category when toggle is on
  const subcatsByCategory = new Map<
    string,
    Array<SubcategoryWithCount & { hasHistory: boolean }>
  >();

  let archivedSubcats: Array<
    SubcategoryWithCount & { hasHistory: boolean; categoryName: string }
  > = [];

  if (subcategoriesEnabled) {
    const { data: activeSubcatsRaw } = await supabase
      .from("subcategories")
      .select("*, transactions(count)")
      .is("archived_at", null)
      .order("created_at", { ascending: true });

    for (const sc of activeSubcatsRaw ?? []) {
      const withCount = sc as SubcategoryWithCount;
      const entry = {
        ...withCount,
        hasHistory: (withCount.transactions[0]?.count ?? 0) > 0,
      };
      const arr = subcatsByCategory.get(withCount.category_id) ?? [];
      arr.push(entry);
      subcatsByCategory.set(withCount.category_id, arr);
    }

    const { data: archivedSubcatsRaw } = await supabase
      .from("subcategories")
      .select("*, transactions(count)")
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false });

    // Build a map of category id -> name for labeling
    const catNameMap = new Map(activeCategories.map((c) => [c.id, c.name]));
    for (const c of archivedCategories) {
      catNameMap.set(c.id, c.name);
    }

    archivedSubcats = (archivedSubcatsRaw ?? []).map((sc) => {
      const withCount = sc as SubcategoryWithCount;
      return {
        ...withCount,
        hasHistory: (withCount.transactions[0]?.count ?? 0) > 0,
        categoryName: catNameMap.get(withCount.category_id) ?? "Unknown",
      };
    });
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-6 text-xl font-bold text-ink-primary">Categories</h1>

      {/* Subcategories toggle */}
      <SubcategoryToggle enabled={subcategoriesEnabled} />

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
                {subcategoriesEnabled && (
                  <div className="ml-4 mt-2 flex flex-col gap-2">
                    {(subcatsByCategory.get(c.id) ?? []).map((sc) => (
                      <SubcategoryRow
                        key={sc.id}
                        subcategory={sc}
                        hasHistory={sc.hasHistory}
                        isArchived={false}
                      />
                    ))}
                    <CreateSubcategoryForm categoryId={c.id} />
                  </div>
                )}
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
                {subcategoriesEnabled && (
                  <div className="ml-4 mt-2 flex flex-col gap-2">
                    {(subcatsByCategory.get(c.id) ?? []).map((sc) => (
                      <SubcategoryRow
                        key={sc.id}
                        subcategory={sc}
                        hasHistory={sc.hasHistory}
                        isArchived={false}
                      />
                    ))}
                    <CreateSubcategoryForm categoryId={c.id} />
                  </div>
                )}
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

      {/* Archived subcategories section */}
      {subcategoriesEnabled && archivedSubcats.length > 0 && (
        <section
          aria-labelledby="archived-subcategories-heading"
          className="mb-8"
        >
          <h2
            id="archived-subcategories-heading"
            className="mb-3 text-base font-semibold text-ink-secondary"
          >
            Archived subcategories
          </h2>
          <ul
            className="flex flex-col gap-3"
            aria-label="Archived subcategories"
          >
            {archivedSubcats.map((sc) => (
              <li key={sc.id}>
                <p className="mb-1 text-xs text-ink-secondary">
                  Under: {sc.categoryName}
                </p>
                <SubcategoryRow
                  subcategory={sc}
                  hasHistory={sc.hasHistory}
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
