"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { SubmitButton } from "@/components/ui/submit-button";
import { OfflineRetryBanner } from "@/components/feedback/OfflineRetryBanner";
import { createGoal } from "@/features/goals/server/actions";

interface GoalFormProps {
  currency: string;
  isFamilyMode: boolean;
}

export function GoalForm({ currency, isFamilyMode }: GoalFormProps) {
  const router = useRouter();
  const [statusMessage, setStatusMessage] = useState("");
  const [fieldError, setFieldError] = useState<{
    field: string;
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastFormDataRef = useRef<FormData | null>(null);

  async function handleSubmit(formData: FormData) {
    lastFormDataRef.current = formData;
    setStatusMessage("");
    setFieldError(null);
    setIsSubmitting(true);

    try {
      const result = await createGoal(formData);
      if (!result.ok) {
        setStatusMessage(result.error.message);
        if (result.error.field) {
          setFieldError({
            field: result.error.field,
            message: result.error.message,
          });
        }
      } else {
        router.push("/goals");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void handleSubmit(new FormData(e.currentTarget));
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-[600px] flex-col gap-4"
    >
      {/* ARIA live region — always present in DOM */}
      <p role="status" aria-live="polite" className="sr-only">
        {statusMessage}
      </p>

      {/* Name */}
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium text-ink-primary">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={100}
          placeholder="e.g. Emergency fund"
          className="min-h-[44px] rounded-md border border-hairline bg-surface-base px-3 py-2 text-sm text-ink-primary"
        />
        {fieldError?.field === "name" && (
          <p className="text-xs text-breathing-low-text">
            {fieldError.message}
          </p>
        )}
      </div>

      {/* Target amount */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="target_amount_display"
          className="text-sm font-medium text-ink-primary"
        >
          Target amount
        </label>
        <div className="flex min-h-[44px] items-center rounded-md border border-hairline bg-surface-base px-3">
          <span className="mr-2 text-sm text-ink-secondary">{currency}</span>
          <input
            id="target_amount_display"
            name="target_amount_display"
            type="text"
            inputMode="decimal"
            required
            placeholder="0.00"
            className="flex-1 bg-transparent text-sm text-ink-primary outline-none"
          />
        </div>
        {fieldError?.field === "target_amount_display" && (
          <p className="text-xs text-breathing-low-text">
            {fieldError.message}
          </p>
        )}
      </div>

      {/* "Make shared" toggle — hidden in single-user mode (hide content, not component) */}
      <div hidden={!isFamilyMode || undefined}>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="make-shared"
            className="flex items-center gap-3 text-sm text-ink-primary"
          >
            <input
              id="make-shared"
              name="is_shared"
              type="checkbox"
              value="true"
              aria-label="Make this a shared goal"
              aria-describedby="make-shared-help"
              className="h-5 w-5 rounded border-hairline accent-brand-accent"
            />
            <span className="font-medium">Make shared</span>
          </label>
          <p id="make-shared-help" className="text-xs text-ink-secondary">
            Both partners can contribute and see progress.
          </p>
        </div>
      </div>

      <OfflineRetryBanner
        onRetry={() => {
          if (lastFormDataRef.current)
            void handleSubmit(lastFormDataRef.current);
        }}
      />

      <SubmitButton disabled={isSubmitting}>Create Goal</SubmitButton>
    </form>
  );
}
