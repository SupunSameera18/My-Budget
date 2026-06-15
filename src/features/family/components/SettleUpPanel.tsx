"use client";

import { useState, useTransition } from "react";
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

  if (!isFamilyMode) return null;

  async function handleSettle() {
    if (isPending) return;
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
  const buttonAriaDisabled = isZeroBalance || isPending ? "true" : "false";

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
            onClick={() => void handleSettle()}
            aria-disabled={buttonAriaDisabled}
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-md bg-brand-accent-strong px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Mark as settled
          </button>
        </>
      )}
    </div>
  );
}
