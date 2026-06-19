"use client";

import { useState, useTransition, useRef } from "react";
import { createExternalTransfer } from "@/features/accounts/server/actions";
import { ACCOUNT_TYPE_LABELS, type Account } from "@/features/accounts/schema";
import { OfflineRetryBanner } from "@/components/feedback/OfflineRetryBanner";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";
import { useTodayDate } from "@/lib/hooks/useTodayDate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyAmountInput } from "@/components/ui/currency-amount-input";
import { ErrorCode, type AppError } from "@/lib/errors";

interface ExternalTransferFormProps {
  accounts: Account[];
  currency: string;
}

export function ExternalTransferForm({
  accounts,
  currency,
}: ExternalTransferFormProps) {
  const today = useTodayDate();

  const [isPending, startTransition] = useTransition();
  const [appError, setAppError] = useState<AppError | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const isOnline = useOnlineStatus();

  if (accounts.length < 1) {
    return (
      <p className="text-sm text-ink-secondary">
        Add an account to record an external transfer.
      </p>
    );
  }

  function submitForm(form: HTMLFormElement) {
    setAppError(null);
    setStatusMessage("");
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        const result = await createExternalTransfer(formData);
        if (!result.ok) {
          setAppError(result.error);
          setStatusMessage(result.error.message);
        } else {
          setStatusMessage("Transfer recorded");
          form.reset();
        }
      } catch {
        const msg =
          "Could not save — please check your connection and try again.";
        setAppError({
          code: ErrorCode.TransferCreateFailed,
          message: msg,
        });
        setStatusMessage(msg);
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

  const selectClass =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 min-h-[44px]";

  return (
    <>
      {/* ARIA live region — always present so screen reader pre-registers it */}
      <p role="status" aria-live="polite" className="sr-only">
        {statusMessage}
      </p>
      <p className="mb-4 text-sm text-ink-secondary">
        Use this for balance adjustments like loan repayments or gift deposits.
        For money that counts as income or spending, log a Transaction instead.
      </p>
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="flex max-w-sm flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account_id">Account</Label>
          <select
            id="account_id"
            name="account_id"
            required
            disabled={isPending}
            className={selectClass}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {ACCOUNT_TYPE_LABELS[a.type]}
              </option>
            ))}
          </select>
          {appError?.field === "account_id" && (
            <p className="text-xs text-destructive">{appError.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="direction">Direction</Label>
          <select
            id="direction"
            name="direction"
            required
            disabled={isPending}
            defaultValue="in"
            className={selectClass}
          >
            <option value="in">Received from external party</option>
            <option value="out">Sent to external party</option>
          </select>
          {appError?.field === "direction" && (
            <p className="text-xs text-destructive">{appError.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Amount</Label>
          <CurrencyAmountInput
            id="amount"
            name="amount"
            currency={currency}
            disabled={isPending}
          />
          {appError?.field === "amount" && (
            <p className="text-xs text-destructive">{appError.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date">Date</Label>
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="note">Note (optional)</Label>
          <Input
            id="note"
            name="note"
            type="text"
            placeholder="e.g. Loan repayment from Alex"
            maxLength={255}
            disabled={isPending}
            className="min-h-[44px]"
          />
          {appError?.field === "note" && (
            <p className="text-xs text-destructive">{appError.message}</p>
          )}
        </div>

        {appError && !appError.field && (
          <p className="text-sm text-destructive">{appError.message}</p>
        )}

        <OfflineRetryBanner onRetry={handleRetry} disabled={isPending} />

        <Button
          type="submit"
          disabled={isPending || !isOnline}
          className="min-h-[44px] w-full"
        >
          {isPending ? "Recording…" : "Record transfer"}
        </Button>
      </form>
    </>
  );
}
