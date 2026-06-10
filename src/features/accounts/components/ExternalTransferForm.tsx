"use client";

import { useState, useTransition, useRef } from "react";
import { createExternalTransfer } from "@/features/accounts/server/actions";
import { ACCOUNT_TYPE_LABELS, type Account } from "@/features/accounts/schema";
import { OfflineRetryBanner } from "@/components/feedback/OfflineRetryBanner";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorCode, type AppError } from "@/lib/errors";

interface ExternalTransferFormProps {
  accounts: Account[];
}

export function ExternalTransferForm({ accounts }: ExternalTransferFormProps) {
  const d = new Date();
  const today = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");

  const [isPending, startTransition] = useTransition();
  const [appError, setAppError] = useState<AppError | null>(null);
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
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        const result = await createExternalTransfer(formData);
        if (!result.ok) {
          setAppError(result.error);
        } else {
          form.reset();
        }
      } catch {
        setAppError({
          code: ErrorCode.TransferCreateFailed,
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

  const selectClass =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 min-h-[44px]";

  return (
    <>
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
            defaultValue=""
            className={selectClass}
          >
            <option value="" disabled>
              Select direction…
            </option>
            <option value="in">Received from external party</option>
            <option value="out">Sent to external party</option>
          </select>
          {appError?.field === "direction" && (
            <p className="text-xs text-destructive">{appError.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            name="amount"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            pattern="^\d+(\.\d{0,2})?$"
            required
            disabled={isPending}
            className="min-h-[44px]"
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
