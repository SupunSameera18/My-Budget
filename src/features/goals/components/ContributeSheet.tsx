"use client";

import { useState, useRef, useEffect } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { OfflineRetryBanner } from "@/components/feedback/OfflineRetryBanner";
import { contributeToGoal } from "@/features/goals/server/actions";
import { currencySymbol } from "@/lib/format";

interface ContributeSheetProps {
  goalId: string;
  goalName: string;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContributeSheet({
  goalId,
  goalName,
  currency,
  open,
  onOpenChange,
}: ContributeSheetProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const savedFocusRef = useRef<HTMLElement | null>(null);

  // Save/restore focus when sheet opens/closes
  useEffect(() => {
    if (open) {
      savedFocusRef.current = document.activeElement as HTMLElement;
    } else {
      savedFocusRef.current?.focus();
      savedFocusRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onOpenChange(false);
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [aria-disabled="true"]:not([disabled])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, isSubmitting, onOpenChange]);

  async function handleSubmit(formData: FormData) {
    setStatusMessage("");
    setIsSubmitting(true);
    try {
      const result = await contributeToGoal(formData);
      if (!result.ok) {
        setStatusMessage(result.error.message);
      } else {
        if (amountRef.current) amountRef.current.value = "";
        setStatusMessage("");
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatusMessage("");
    void handleSubmit(new FormData(e.currentTarget));
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={() => {
          if (!isSubmitting) onOpenChange(false);
        }}
        aria-hidden="true"
      />

      {/* Sheet panel — bottom drawer */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contribute-sheet-title"
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-xl bg-card p-6 shadow-xl"
      >
        <h2
          id="contribute-sheet-title"
          className="mb-4 text-base font-semibold text-ink-primary"
        >
          Contribute to {goalName}
        </h2>

        {/* ARIA live region — always present when sheet is open */}
        <p role="status" aria-live="polite" className="sr-only">
          {statusMessage}
        </p>

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <input type="hidden" name="goal_id" value={goalId} />

          {/* Amount */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="contribute-amount"
              className="text-sm font-medium text-ink-primary"
            >
              Amount
            </label>
            <div className="flex min-h-[44px] items-center rounded-md border border-hairline bg-surface-base px-3">
              <span className="mr-2 text-sm text-ink-secondary">
                {currencySymbol(currency)}
              </span>
              <input
                ref={amountRef}
                id="contribute-amount"
                name="amount_display"
                type="text"
                inputMode="decimal"
                required
                autoFocus
                placeholder="0.00"
                className="flex-1 bg-transparent text-sm text-ink-primary outline-none"
              />
            </div>
          </div>

          {/* Date */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="contribute-date"
              className="text-sm font-medium text-ink-primary"
            >
              Date
            </label>
            <input
              id="contribute-date"
              name="date"
              type="date"
              defaultValue={todayStr}
              required
              className="min-h-[44px] rounded-md border border-hairline bg-surface-base px-3 py-2 text-sm text-ink-primary"
            />
          </div>

          {statusMessage && (
            <p className="text-xs text-destructive">{statusMessage}</p>
          )}

          <OfflineRetryBanner
            disabled={isSubmitting}
            onRetry={() => {
              if (amountRef.current) {
                const fd = new FormData();
                fd.set("goal_id", goalId);
                fd.set("amount_display", amountRef.current.value);
                fd.set(
                  "date",
                  (
                    document.getElementById(
                      "contribute-date",
                    ) as HTMLInputElement
                  )?.value ?? todayStr,
                );
                setStatusMessage("");
                void handleSubmit(fd);
              }
            }}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="min-h-[44px] flex-1 rounded-md border border-hairline bg-surface-base text-sm text-ink-secondary disabled:opacity-50"
            >
              Cancel
            </button>
            <div className="flex-1">
              <SubmitButton disabled={isSubmitting} className="w-full">
                Save
              </SubmitButton>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
