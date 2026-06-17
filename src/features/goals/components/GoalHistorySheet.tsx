"use client";

import { useState, useEffect, useRef } from "react";
import { formatMoney } from "@/lib/format";
import {
  getGoalContributions,
  deleteGoalContributionSet,
} from "@/features/goals/server/actions";
import type { GoalContributionItem } from "@/features/goals/schema";

interface GoalHistorySheetProps {
  goalId: string;
  goalName: string;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GoalHistorySheet({
  goalId,
  goalName,
  currency,
  open,
  onOpenChange,
}: GoalHistorySheetProps) {
  const [contributions, setContributions] = useState<
    GoalContributionItem[] | null
  >(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const savedFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      savedFocusRef.current = document.activeElement as HTMLElement;
    } else {
      savedFocusRef.current?.focus();
      savedFocusRef.current = null;
      setContributions(null);
      setStatusMessage("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getGoalContributions(goalId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setContributions(result.data);
      } else {
        setStatusMessage(result.error.message);
        setContributions([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, goalId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deletingId) {
        onOpenChange(false);
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
  }, [open, deletingId, onOpenChange]);

  async function handleUndoMacroContribution(
    applicationId: string,
    contributionId: string,
  ) {
    setStatusMessage("");
    setDeletingId(contributionId);
    try {
      const result = await deleteGoalContributionSet(applicationId);
      if (!result.ok) {
        setStatusMessage(result.error.message);
      } else {
        // Re-fetch contributions after deletion
        const refreshed = await getGoalContributions(goalId);
        if (refreshed.ok) setContributions(refreshed.data);
      }
    } finally {
      setDeletingId(null);
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={() => {
          if (!deletingId) onOpenChange(false);
        }}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-history-title"
        className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-xl bg-card p-6 shadow-xl"
      >
        <h2
          id="goal-history-title"
          className="mb-4 text-base font-semibold text-ink-primary"
        >
          Contribution history — {goalName}
        </h2>

        {/* ARIA live region — always present when sheet is open */}
        <p role="status" aria-live="polite" className="sr-only">
          {statusMessage}
        </p>

        {contributions === null ? (
          <p className="text-sm text-ink-secondary">Loading…</p>
        ) : contributions.length === 0 ? (
          <p className="text-sm text-ink-secondary">No contributions yet.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {contributions.map((contrib) => {
              const isMacro = contrib.macro_application_id !== null;
              const isDeleting = deletingId === contrib.id;
              return (
                <li
                  key={contrib.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-surface-base px-3 py-2 text-sm"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-ink-primary">
                      {formatMoney(contrib.amount_minor, currency)}
                    </span>
                    <span className="text-xs text-ink-secondary">
                      {contrib.date}
                      {isMacro && (
                        <span className="ml-1.5 rounded bg-purple-100 px-1 py-0.5 text-xs font-medium text-purple-800">
                          Macro
                        </span>
                      )}
                    </span>
                  </div>
                  {isMacro && (
                    <button
                      type="button"
                      onClick={() =>
                        void handleUndoMacroContribution(
                          contrib.macro_application_id!,
                          contrib.id,
                        )
                      }
                      disabled={!!deletingId}
                      aria-label={`Undo macro contribution of ${formatMoney(contrib.amount_minor, currency)} on ${contrib.date}`}
                      className="min-h-[36px] rounded-md border border-hairline bg-surface-base px-3 text-xs text-ink-secondary disabled:opacity-50"
                    >
                      {isDeleting ? "Undoing…" : "Undo"}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {statusMessage && (
          <p className="mt-2 text-xs text-breathing-low-text">{statusMessage}</p>
        )}

        <div className="mt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={!!deletingId}
            className="min-h-[44px] w-full rounded-md border border-hairline bg-surface-base text-sm text-ink-secondary disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
