import { createClient } from "@/lib/supabase/server";
import { AccountCard } from "@/features/accounts/components/AccountCard";
import { CreateAccountForm } from "@/features/accounts/components/CreateAccountForm";
import { InternalTransferForm } from "@/features/accounts/components/InternalTransferForm";
import { ExternalTransferForm } from "@/features/accounts/components/ExternalTransferForm";
import type { Account } from "@/features/accounts/schema";

type AccountWithCount = Account & { transactions: { count: number }[] };

export default async function AccountsPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id ?? "";

  const { data: activeRaw } = await supabase
    .from("accounts")
    .select("*, transactions(count)")
    .eq("user_id", userId) // defense-in-depth — RLS already enforces this
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  const activeAccounts = (activeRaw ?? []).map((a) => ({
    ...(a as AccountWithCount),
    hasHistory: ((a as AccountWithCount).transactions[0]?.count ?? 0) > 0,
  }));

  const currency = activeAccounts[0]?.currency ?? "USD";

  const { data: archivedRaw } = await supabase
    .from("accounts")
    .select("*, transactions(count)")
    .eq("user_id", userId) // defense-in-depth — RLS already enforces this
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  const archivedAccounts = (archivedRaw ?? []).map((a) => ({
    ...(a as AccountWithCount),
    hasHistory: ((a as AccountWithCount).transactions[0]?.count ?? 0) > 0,
  }));

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-6 text-xl font-bold text-ink-primary">Accounts</h1>

      {/* Active accounts */}
      {activeAccounts.length > 0 ? (
        <ul className="mb-8 flex flex-col gap-3" aria-label="Your accounts">
          {activeAccounts.map((a) => (
            <li key={a.id}>
              <AccountCard
                account={a}
                hasHistory={a.hasHistory}
                isArchived={false}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-8 text-sm text-ink-secondary">
          No active accounts. Create your first one below.
        </p>
      )}

      {/* Archived accounts — only shown when at least one exists */}
      {archivedAccounts.length > 0 && (
        <section aria-labelledby="archived-heading" className="mb-8">
          <h2
            id="archived-heading"
            className="mb-3 text-base font-semibold text-ink-secondary"
          >
            Archived accounts
          </h2>
          <ul className="flex flex-col gap-3" aria-label="Archived accounts">
            {archivedAccounts.map((a) => (
              <li key={a.id}>
                <AccountCard
                  account={a}
                  hasHistory={a.hasHistory}
                  isArchived={true}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Create account form */}
      <section aria-labelledby="create-account-heading" className="mb-8">
        <h2
          id="create-account-heading"
          className="mb-4 text-base font-semibold text-ink-primary"
        >
          Add account
        </h2>
        <CreateAccountForm />
      </section>

      {/* Record a transfer */}
      <section aria-labelledby="transfer-heading" className="mb-8">
        <h2
          id="transfer-heading"
          className="mb-4 text-base font-semibold text-ink-primary"
        >
          Record a transfer
        </h2>
        <InternalTransferForm accounts={activeAccounts} currency={currency} />
      </section>

      {/* External transfer */}
      <section aria-labelledby="external-transfer-heading">
        <h2
          id="external-transfer-heading"
          className="mb-4 text-base font-semibold text-ink-primary"
        >
          External transfer
        </h2>
        <ExternalTransferForm accounts={activeAccounts} />
      </section>
    </div>
  );
}
