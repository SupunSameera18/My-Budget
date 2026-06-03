import { getAccounts, createAccount } from "@/features/accounts/server/actions";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from "@/features/accounts/schema";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function AccountsPage() {
  async function handleCreateAccount(formData: FormData) {
    "use server";
    await createAccount(formData);
  }

  const result = await getAccounts();
  const accounts = result.ok ? result.data : [];

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-6 text-xl font-bold text-ink-primary">Accounts</h1>

      {/* Account list */}
      {accounts.length > 0 ? (
        <ul className="mb-8 flex flex-col gap-3" aria-label="Your accounts">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center justify-between rounded-lg bg-card px-4 py-3 shadow-sm"
            >
              <div>
                <p className="text-sm font-semibold text-ink-primary">
                  {account.name}
                </p>
                <p className="text-xs text-ink-secondary">
                  {
                    ACCOUNT_TYPE_LABELS[
                      account.type as keyof typeof ACCOUNT_TYPE_LABELS
                    ]
                  }
                </p>
              </div>
              <span className="font-mono text-sm tabular-nums text-ink-primary">
                {formatMoney(account.actual_balance_minor, account.currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-8 text-sm text-ink-secondary">
          No accounts yet. Create your first one below.
        </p>
      )}

      {/* Create account form */}
      <section aria-labelledby="create-account-heading">
        <h2
          id="create-account-heading"
          className="mb-4 text-base font-semibold text-ink-primary"
        >
          Add account
        </h2>
        <form
          action={handleCreateAccount}
          className="flex max-w-sm flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Account name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              placeholder="e.g. Main Bank"
              maxLength={50}
              required
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Account type</Label>
            <select
              id="type"
              name="type"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="openingBalance">Opening balance</Label>
            <Input
              id="openingBalance"
              name="openingBalance"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              pattern="^\d+(\.\d{0,2})?$"
              defaultValue="0"
            />
          </div>

          <Button type="submit" className="min-h-[44px] w-full">
            Create account
          </Button>
        </form>
      </section>
    </div>
  );
}
