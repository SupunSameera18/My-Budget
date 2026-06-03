import { createFirstAccountAndAdvance } from "@/features/onboarding/server/actions";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from "@/features/accounts/schema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

export default function AccountPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8 p-6 pt-12">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Step 2 of 3
        </p>
        <h1 className="text-2xl font-bold text-ink-primary">
          Create your first account.
        </h1>
        <p className="mt-2 text-sm text-ink-secondary">
          Add the account you&apos;ll track your money in (e.g. your main bank
          account).
        </p>
      </div>

      <form
        action={createFirstAccountAndAdvance}
        className="flex flex-col gap-6"
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

        <SubmitButton className="min-h-[44px] w-full">Continue</SubmitButton>
      </form>
    </div>
  );
}
