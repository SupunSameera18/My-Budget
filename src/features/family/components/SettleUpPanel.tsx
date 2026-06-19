"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/feedback/EmptyState";
import { markSettled } from "@/features/family/server/actions";
import { deriveSettleUpLabel } from "@/features/family/settle-label";

interface Props {
  isFamilyMode: boolean;
  tally: number | null;
  familyUnitId: string;
  partnerDisplayName: string;
  currency: string;
}

export function SettleUpPanel({
  isFamilyMode,
  tally,
  familyUnitId,
  partnerDisplayName,
  currency,
}: Props) {
  const router = useRouter();
  const [statusMsg, setStatusMsg] = useState("");
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (showConfirm) confirmBtnRef.current?.focus();
  }, [showConfirm]);

  if (!isFamilyMode) return null;

  async function handleSettle() {
    if (isPending) return;
    setShowConfirm(false);
    setStatusMsg("");
    startTransition(async () => {
      const result = await markSettled(familyUnitId);
      if (result.ok) {
        setStatusMsg("Balance settled. Running tally has been reset.");
        router.refresh();
      } else {
        setStatusMsg("Settlement failed. Please try again.");
      }
    });
  }

  const isZeroBalance = tally === 0;

  return (
    <div className="space-y-3 rounded-xl border border-hairline bg-card p-4">
      <div aria-live="polite" role="status" className="sr-only">
        {statusMsg}
      </div>

      <h2 className="text-base font-semibold text-ink-primary">Settle Up</h2>

      {tally === null ? (
        <EmptyState
          heading="Unable to load balance"
          body="Could not load the current balance. Please try refreshing."
        />
      ) : (
        <>
          <p className="text-sm text-ink-primary">
            {deriveSettleUpLabel(tally, partnerDisplayName, currency)}
          </p>

          {!isZeroBalance && (
            <p role="note" className="text-xs text-ink-secondary">
              My Budget tracks this — you make the transfer.
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              if (!isZeroBalance) {
                setShowConfirm(true);
              } else {
                void handleSettle();
              }
            }}
            aria-disabled={isZeroBalance || isPending ? "true" : undefined}
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-md bg-brand-accent-strong px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Mark as settled
          </button>

          {/* Inline confirmation — always mounted; hidden when not shown (§9) */}
          <div
            role="alertdialog"
            aria-labelledby="settle-confirm-heading"
            className={`${showConfirm ? "flex" : "hidden"} flex-col gap-3 rounded-lg border border-hairline bg-surface-inset p-4`}
          >
            <p
              id="settle-confirm-heading"
              className="text-sm font-medium text-ink-primary"
            >
              Lock shared transactions?
            </p>
            <p className="text-sm text-ink-secondary">
              After settling, all shared transactions up to today will be locked
              and cannot be edited or deleted.
            </p>
            <div className="flex gap-2">
              <button
                ref={confirmBtnRef}
                type="button"
                disabled={isPending}
                aria-disabled={isPending ? "true" : undefined}
                onClick={() => void handleSettle()}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-md bg-brand-accent-strong px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {isPending ? "Settling…" : "Confirm settle up"}
              </button>
              <button
                type="button"
                disabled={isPending}
                aria-disabled={isPending ? "true" : undefined}
                onClick={() => setShowConfirm(false)}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-md border border-hairline bg-card px-4 py-2 text-sm font-medium text-ink-primary hover:bg-surface-muted disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
