"use client";

import { useState, useTransition, useRef } from "react";
import { createAccount } from "@/features/accounts/server/actions";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from "@/features/accounts/schema";
import { OfflineRetryBanner } from "@/components/feedback/OfflineRetryBanner";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorCode, type AppError } from "@/lib/errors";

export function CreateAccountForm() {
  const [isPending, startTransition] = useTransition();
  const [appError, setAppError] = useState<AppError | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isOnline = useOnlineStatus();

  function submitForm(form: HTMLFormElement) {
    setAppError(null);
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        const result = await createAccount(formData);
        if (!result.ok) {
          setAppError(result.error);
        } else {
          form.reset();
        }
      } catch {
        setAppError({
          code: ErrorCode.AccountCreateFailed,
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
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
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
          disabled={isPending}
        />
        {appError?.field === "name" && (
          <p className="text-xs text-destructive">{appError.message}</p>
        )}
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
        <Input
          id="openingBalance"
          name="openingBalance"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          pattern="^\d+(\.\d{0,2})?$"
          defaultValue="0"
          disabled={isPending}
        />
        {appError?.field === "openingBalance" && (
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
        {isPending ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
}
