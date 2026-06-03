"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { logTransaction } from "@/features/transactions/server/actions";
import { OfflineRetryBanner } from "@/components/feedback/OfflineRetryBanner";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Account } from "@/features/accounts/schema";
import type { TransactionCategory } from "@/features/transactions/schema";
import { ErrorCode, type AppError } from "@/lib/errors";

interface LogTransactionFormProps {
  accounts: Account[];
  categories: TransactionCategory[];
  defaultAccountId: string | null;
  currency: string;
}

export function LogTransactionForm({
  accounts,
  categories,
  defaultAccountId,
  currency,
}: LogTransactionFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [appError, setAppError] = useState<AppError | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isOnline = useOnlineStatus();

  // toLocaleDateString('en-CA') produces YYYY-MM-DD in the user's local timezone,
  // unlike toISOString() which gives UTC and can show yesterday for users east of UTC.
  const today = new Date().toLocaleDateString("en-CA");

  const expenseCategories = categories.filter((c) => c.type === "expense");
  const incomeCategories = categories.filter((c) => c.type === "income");

  function submitForm(form: HTMLFormElement) {
    setAppError(null);
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        const result = await logTransaction(formData);
        if (!result.ok) {
          setAppError(result.error);
        } else {
          router.push("/dashboard");
        }
      } catch {
        setAppError({
          code: ErrorCode.TransactionCreateFailed,
          message:
            "Could not save — please check your connection and try again.",
        });
      }
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submitForm(e.currentTarget);
  }

  function handleRetry() {
    if (formRef.current) {
      submitForm(formRef.current);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-5"
      ref={formRef}
    >
      {/* Amount */}
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="amount_display"
          className="text-xs font-bold text-ink-primary"
        >
          Amount{" "}
          <span className="font-normal text-ink-secondary">({currency})</span>
        </Label>
        <Input
          id="amount_display"
          name="amount_display"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          pattern="^\d+(\.\d{0,2})?$"
          required
          autoComplete="off"
          disabled={isPending}
          className="min-h-[44px]"
        />
        {appError?.field === "amount_display" && (
          <p className="text-xs text-destructive">{appError.message}</p>
        )}
      </div>

      {/* Category */}
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="category_id"
          className="text-xs font-bold text-ink-primary"
        >
          Category
        </Label>
        <select
          id="category_id"
          name="category_id"
          required
          defaultValue=""
          disabled={isPending}
          className="flex h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <option value="" disabled>
            Select a category
          </option>
          {expenseCategories.length > 0 && (
            <optgroup label="Expense">
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
          {incomeCategories.length > 0 && (
            <optgroup label="Income">
              {incomeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {appError?.field === "category_id" && (
          <p className="text-xs text-destructive">{appError.message}</p>
        )}
      </div>

      {/* Account */}
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="account_id"
          className="text-xs font-bold text-ink-primary"
        >
          Account
        </Label>
        <select
          id="account_id"
          name="account_id"
          required
          defaultValue={defaultAccountId ?? ""}
          disabled={isPending}
          className="flex h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {appError?.field === "account_id" && (
          <p className="text-xs text-destructive">{appError.message}</p>
        )}
      </div>

      {/* Date */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="date" className="text-xs font-bold text-ink-primary">
          Date
        </Label>
        <Input
          id="date"
          name="date"
          type="date"
          defaultValue={today}
          required
          disabled={isPending}
          className="min-h-[44px]"
        />
        {appError?.field === "date" && (
          <p className="text-xs text-destructive">{appError.message}</p>
        )}
      </div>

      {/* Note (optional) */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note" className="text-xs font-bold text-ink-primary">
          Note{" "}
          <span className="font-normal text-ink-secondary">(optional)</span>
        </Label>
        <Input
          id="note"
          name="note"
          type="text"
          maxLength={280}
          autoComplete="off"
          disabled={isPending}
          className="min-h-[44px]"
        />
      </div>

      {/* Global (non-field) error */}
      {appError && !appError.field && (
        <p className="text-sm text-destructive">{appError.message}</p>
      )}

      <OfflineRetryBanner onRetry={handleRetry} disabled={isPending} />

      <Button
        type="submit"
        disabled={isPending || !isOnline}
        className="min-h-[44px] w-full rounded-md bg-brand-accent-strong font-bold text-white"
      >
        {isPending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
