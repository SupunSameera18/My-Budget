import { Suspense } from "react";
import { z } from "zod";
import { TransactionFilters } from "@/features/transactions/components/TransactionFilters";
import { TransactionTable } from "@/features/transactions/components/TransactionTable";
import { getTransactionList } from "@/features/transactions/server/actions";
import { getFamilyStatus } from "@/features/family/server/actions";
import type { TransactionListFilters } from "@/features/transactions/schema";
import type { Scope } from "@/features/analytics/schema";

const VALID_SCOPES: Scope[] = ["personal", "shared", "combined"];

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    account?: string;
    category?: string;
    from?: string;
    to?: string;
    showArchivedAccounts?: string;
    showArchivedCategories?: string;
    scope?: string;
  }>;
}) {
  const [params, familyStatus] = await Promise.all([
    searchParams,
    getFamilyStatus(),
  ]);

  const isFamilyMode = familyStatus.status === "in_family";
  const familyUnitId =
    familyStatus.status === "in_family" ? familyStatus.familyUnitId : undefined;

  const scope: Scope =
    isFamilyMode && VALID_SCOPES.includes(params.scope as Scope)
      ? (params.scope as Scope)
      : "combined";

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const filters: TransactionListFilters = {
    account_id: z.string().uuid().safeParse(params.account).success
      ? params.account
      : undefined,
    category_id: z.string().uuid().safeParse(params.category).success
      ? params.category
      : undefined,
    from: datePattern.test(params.from ?? "") ? params.from : undefined,
    to: datePattern.test(params.to ?? "") ? params.to : undefined,
    showArchivedAccounts: params.showArchivedAccounts === "1",
    showArchivedCategories: params.showArchivedCategories === "1",
    isFamilyMode,
    familyUnitId,
    scope,
  };

  const result = await getTransactionList(filters);
  const listData = result.ok
    ? result.data
    : {
        items: [],
        accounts: [],
        categories: [],
        currency: "USD",
        hasMore: false,
      };

  return (
    <div className="mx-auto max-w-5xl p-4">
      <h1 className="mb-6 text-xl font-bold text-ink-primary">Transactions</h1>

      <Suspense fallback={null}>
        <TransactionFilters
          accounts={listData.accounts}
          categories={listData.categories}
          currentFilters={filters}
          isFamilyMode={isFamilyMode}
        />
      </Suspense>

      <TransactionTable
        items={listData.items}
        currency={listData.currency}
        isFamilyMode={isFamilyMode}
        familyUnitId={familyUnitId ?? null}
      />
      {listData.hasMore && (
        <p className="mt-4 text-center text-sm text-ink-secondary">
          Showing the {listData.items.length} most recent matching transactions.
          Narrow your filters to see more specific results.
        </p>
      )}
    </div>
  );
}
