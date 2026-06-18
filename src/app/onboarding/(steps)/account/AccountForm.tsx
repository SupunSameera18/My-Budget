"use client";

import { useState, useTransition } from "react";
import { createFirstAccountAndAdvance } from "@/features/onboarding/server/actions";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from "@/features/accounts/schema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

function getCurrencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "symbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

export function AccountForm({ currency }: { currency: string }) {
  const [isPending, startTransition] = useTransition();
  const [balance, setBalance] = useState("");
  const [decimalError, setDecimalError] = useState(false);

  const symbol = getCurrencySymbol(currency);

  function handleBalanceChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setBalance(val);
    const decimalMatch = val.match(/\.(\d+)$/);
    setDecimalError(!!decimalMatch && decimalMatch[1].length > 2);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (decimalError) return;
    const formData = new FormData(e.currentTarget);
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
          required
          autoComplete="off"
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="type">Account type</Label>
        <select
          id="type"
          name="type"
          required
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
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-3 text-sm text-ink-secondary">
            {symbol}
          </span>
          <Input
            id="openingBalance"
            name="openingBalance"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={balance}
            onChange={handleBalanceChange}
            disabled={isPending}
            className="min-h-[44px] pl-8"
          />
        </div>
        {decimalError && (
          <p className="text-xs text-destructive">
            Use only two decimal places.
          </p>
        )}
      </div>

      <SubmitButton
        className="min-h-[44px] w-full"
        disabled={isPending || decimalError}
      >
        Continue
      </SubmitButton>
    </form>
  );
}
