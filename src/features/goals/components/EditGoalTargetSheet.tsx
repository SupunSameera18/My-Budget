"use client";

import { useRef, useState, useEffect } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { OfflineRetryBanner } from "@/components/feedback/OfflineRetryBanner";
import { editGoalTarget } from "@/features/goals/server/actions";
import { currencySymbol } from "@/lib/format";

interface EditGoalTargetSheetProps {
  goalId: string;
  goalName: string;
  currentTargetMinor: number;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditGoalTargetSheet({
  goalId,
  goalName,
  currentTargetMinor,
  currency,
  open,
  onOpenChange,
}: EditGoalTargetSheetProps) {
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
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
      const result = await editGoalTarget(formData);
      if (!result.ok) {
        setStatusMessage(result.error.message);
      } else {
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

  return (
    <>
      {/* ARIA live region — always in DOM so screen readers pre-register it */}
      <p role="status" aria-live="polite" className="sr-only">
        {statusMessage}
      </p>

      {open && (
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
            aria-labelledby="edit-target-sheet-title"
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-xl bg-card p-6 shadow-xl"
          >
            <h2
              id="edit-target-sheet-title"
              className="mb-4 text-base font-semibold text-ink-primary"
            >
              Edit target for {goalName}
            </h2>

            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
              <input type="hidden" name="goal_id" value={goalId} />

              {/* Target amount */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="edit-target-amount"
                  className="text-sm font-medium text-ink-primary"
                >
                  Target amount
                </label>
                <div className="flex min-h-[44px] items-center rounded-md border border-hairline bg-surface-base px-3">
                  <span className="mr-2 text-sm text-ink-secondary">
                    {currencySymbol(currency)}
                  </span>
                  <input
                    ref={inputRef}
                    id="edit-target-amount"
                    name="target_amount_display"
                    type="text"
                    inputMode="decimal"
                    required
                    defaultValue={(currentTargetMinor / 100).toFixed(2)}
                    className="flex-1 bg-transparent text-sm text-ink-primary outline-none"
                  />
                </div>
              </div>

              {statusMessage && (
                <p className="text-xs text-destructive">{statusMessage}</p>
              )}

              <OfflineRetryBanner
                disabled={isSubmitting}
                onRetry={() => {
                  if (inputRef.current) {
                    const fd = new FormData();
                    fd.set("goal_id", goalId);
                    fd.set("target_amount_display", inputRef.current.value);
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
      )}
    </>
  );
}
