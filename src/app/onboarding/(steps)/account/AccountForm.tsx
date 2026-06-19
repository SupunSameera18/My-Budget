"use client";

import { useState, useTransition } from "react";
import { createFirstAccountAndAdvance } from "@/features/onboarding/server/actions";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from "@/features/accounts/schema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { CurrencyAmountInput } from "@/components/ui/currency-amount-input";

interface InitialAccount {
  name: string;
  type: string;
  balance: string;
}

export function AccountForm({
  currency,
  initialAccount = null,
}: {
  currency: string;
  initialAccount?: InitialAccount | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [nameError, setNameError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    // Custom validation in place of native browser constraints.
    const name = (formData.get("name") as string)?.trim() ?? "";
    if (!name) {
      setNameError("Enter an account name.");
      return;
    }
    setNameError(null);
    startTransition(async () => {
      await createFirstAccountAndAdvance(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Account name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          placeholder="e.g. Main Bank"
          maxLength={50}
          defaultValue={initialAccount?.name ?? ""}
          autoComplete="off"
          disabled={isPending}
          aria-invalid={!!nameError}
        />
        {nameError && <p className="text-xs text-destructive">{nameError}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="type">Account type</Label>
        <select
          id="type"
          name="type"
          defaultValue={initialAccount?.type ?? ACCOUNT_TYPES[0]}
          disabled={isPending}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
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
        <CurrencyAmountInput
          id="openingBalance"
          name="openingBalance"
          currency={currency}
          disabled={isPending}
          initialValue={initialAccount?.balance ?? ""}
        />
      </div>

      <SubmitButton className="min-h-[44px] w-full" disabled={isPending}>
        Continue
      </SubmitButton>
    </form>
  );
}
