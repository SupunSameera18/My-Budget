import { getTransactionFormData } from "@/features/transactions/server/actions";
import { LogSheet } from "@/features/transactions/components/LogSheet";

export default async function NewTransactionPage() {
  const result = await getTransactionFormData();

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-md p-4">
        <p className="text-sm text-destructive">
          Unable to load the log form. Please try again later.
        </p>
      </div>
    );
  }

  const {
    accounts,
    categories,
    currency,
    defaultAccountId,
    subcategoriesEnabled,
    subcategories,
    currentBreathingRoomMinor,
  } = result.data;

  if (accounts.length === 0) {
    return (
      <div className="mx-auto max-w-md p-4">
        <p className="text-sm text-ink-secondary">
          You need an account before logging a transaction.{" "}
          <a
            href="/settings/accounts"
            className="text-accent-text font-medium underline-offset-4 hover:underline"
          >
            Add an account
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-4">
      <h1 className="mb-6 text-xl font-bold text-ink-primary">
        Log transaction
      </h1>
      <LogSheet
        accounts={accounts}
        categories={categories}
        defaultAccountId={defaultAccountId}
        currency={currency}
        subcategoriesEnabled={subcategoriesEnabled}
        subcategories={subcategories}
        currentBreathingRoomMinor={currentBreathingRoomMinor}
      />
    </div>
  );
}
