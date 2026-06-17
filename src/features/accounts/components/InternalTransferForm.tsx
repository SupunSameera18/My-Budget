"use client";

import { useState, useTransition, useRef } from "react";
import { createInternalTransfer } from "@/features/accounts/server/actions";
import { ACCOUNT_TYPE_LABELS, type Account } from "@/features/accounts/schema";
import { OfflineRetryBanner } from "@/components/feedback/OfflineRetryBanner";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";
import { useTodayDate } from "@/lib/hooks/useTodayDate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorCode, type AppError } from "@/lib/errors";

interface InternalTransferFormProps {
  accounts: Account[];
  currency: string;
}

export function InternalTransferForm({ accounts }: InternalTransferFormProps) {
  const today = useTodayDate();
  const [isPending, startTransition] = useTransition();
  const [appError, setAppError] = useState<AppError | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const isOnline = useOnlineStatus();

  if (accounts.length < 2) {
    return (
      <p className="text-sm text-ink-secondary">
        Add at least two accounts to record a transfer.
      </p>
    );
  }

  function submitForm(form: HTMLFormElement) {
    setAppError(null);
    setStatusMessage("");
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        const result = await createInternalTransfer(formData);
        if (!result.ok) {
          setAppError(result.error);
          setStatusMessage(result.error.message);
        } else {
          setStatusMessage("Transfer recorded");
          form.reset();
          // Restore second-account default on "To" — native reset reverts to first option
          const toSelect = form.elements.namedItem(
            "to_account_id",
          ) as HTMLSelectElement | null;
          if (toSelect && accounts[1]) toSelect.value = accounts[1].id;
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
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="flex max-w-sm flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from_account_id">From account</Label>
          <select
            id="from_account_id"
            name="from_account_id"
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
          {appError?.field === "from_account_id" && (
            <p className="text-xs text-destructive">{appError.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to_account_id">To account</Label>
          <select
            id="to_account_id"
            name="to_account_id"
            required
            disabled={isPending}
            defaultValue={accounts[1]?.id}
            className={selectClass}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {ACCOUNT_TYPE_LABELS[a.type]}
              </option>
            ))}
          </select>
          {appError?.field === "to_account_id" && (
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
            placeholder="e.g. Rent prepayment"
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
