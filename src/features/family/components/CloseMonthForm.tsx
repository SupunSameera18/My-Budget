"use client";

import { useState, useEffect, useTransition } from "react";
import { formatMoney } from "@/lib/format";
import {
  markSettled,
  getUserAccountsForReconciliation,
  closeMonth,
} from "@/features/family/server/actions";

interface Account {
  id: string;
  name: string;
  balanceMinor: number;
  currency: string;
}

interface Props {
  isFamilyMode: boolean;
  familyUnitId: string;
  tally: number | null;
  currency: string;
}

export function CloseMonthForm({
  isFamilyMode,
  familyUnitId,
  tally,
  currency,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [step1Complete, setStep1Complete] = useState(false);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [actualBalances, setActualBalances] = useState<Record<string, string>>(
    {},
  );
  const [liveMessage, setLiveMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  // Load accounts client-side on mount (useEffect cancellation pattern §4)
  useEffect(() => {
    if (!isFamilyMode) return;
    let cancelled = false;
    getUserAccountsForReconciliation().then((data) => {
      if (!cancelled) setAccounts(data);
    });
    return () => {
      cancelled = true;
    };
  }, [isFamilyMode]);

  if (!isFamilyMode) return null;

  const isZeroTally = tally === 0;

  function handleBalanceChange(accountId: string, value: string) {
    setActualBalances((prev) => ({ ...prev, [accountId]: value }));
  }

  function parseDelta(account: Account, inputStr: string): number | null {
    if (!inputStr.trim()) return null;
    const parsed = parseFloat(inputStr);
    if (isNaN(parsed)) return null;
    const actualMinor = Math.round(parsed * 100);
    const delta = actualMinor - account.balanceMinor;
    return delta;
  }

  function formatDelta(delta: number, acct: Account): string {
    const abs = Math.abs(delta);
    const sign = delta >= 0 ? "+" : "−";
    return `Adjustment: ${sign}${formatMoney(abs, acct.currency)}`;
  }

  async function handleStep1() {
    if (isPending) return;
    setLiveMessage("");
    startTransition(async () => {
      if (!isZeroTally) {
        const result = await markSettled(familyUnitId);
        if (!result.ok) {
          setLiveMessage("Settlement failed. Please try again.");
          return;
        }
      }
      setStep1Complete(true);
      setStep(2);
    });
  }

  async function handleCloseMonth() {
    if (!step1Complete || isPending) return;
    setLiveMessage("");

    const adjustments = (accounts ?? [])
      .map((acct) => {
        const delta = parseDelta(acct, actualBalances[acct.id] ?? "");
        if (delta === null || delta === 0) return null;
        return { accountId: acct.id, deltaMinor: delta };
      })
      .filter(
        (a): a is { accountId: string; deltaMinor: number } => a !== null,
      );

    startTransition(async () => {
      const result = await closeMonth(familyUnitId, adjustments);
      if (result.ok) {
        setLiveMessage("Month closed successfully.");
      } else {
        setLiveMessage("Reconciliation failed. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-hairline bg-card p-4">
      {/* Always-mounted ARIA live region (§9 rule: reset before set) */}
      <div aria-live="polite" role="status" className="sr-only">
        {liveMessage}
      </div>

      <h2 className="text-base font-semibold text-ink-primary">
        Close the Month
      </h2>

      {/* ── Step 1: Settle Balance ── */}
      {step === 1 && (
        <section aria-labelledby="close-step1-heading">
          <h3
            id="close-step1-heading"
            className="mb-2 text-sm font-medium text-ink-primary"
          >
            Step 1 of 2: Settle Balance
          </h3>

          {isZeroTally ? (
            <p className="mb-3 text-sm text-ink-secondary">
              You&apos;re all settled up.
            </p>
          ) : (
            <p className="mb-3 text-sm text-ink-secondary">
              Current balance:{" "}
              {tally !== null
                ? formatMoney(Math.abs(tally), currency)
                : "Loading…"}
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleStep1()}
            disabled={isPending}
            aria-disabled={isPending ? "true" : undefined}
            className="inline-flex items-center justify-center rounded-md bg-brand-accent-strong px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {isZeroTally ? "Continue →" : "Confirm & Continue →"}
          </button>
        </section>
      )}

      {/* ── Step 2: Verify Each Account ── */}
      {step === 2 && (
        <section aria-labelledby="close-step2-heading">
          <h3
            id="close-step2-heading"
            className="mb-3 text-sm font-medium text-ink-primary"
          >
            Step 2 of 2: Verify Account Balances
          </h3>

          {accounts === null ? (
            <p className="text-sm text-ink-secondary">Loading accounts…</p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-ink-secondary">No accounts to verify.</p>
          ) : (
            <div className="space-y-4">
              {accounts.map((acct) => {
                const inputVal = actualBalances[acct.id] ?? "";
                const delta = parseDelta(acct, inputVal);
                const hasDelta = delta !== null && delta !== 0;
                return (
                  <div key={acct.id} className="space-y-1">
                    <p
                      id={`acct-name-${acct.id}`}
                      className="text-sm font-medium text-ink-primary"
                    >
                      {acct.name}
                    </p>
                    <p className="text-xs text-ink-secondary">
                      App balance:{" "}
                      {formatMoney(acct.balanceMinor, acct.currency)}
                    </p>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Actual balance"
                      value={inputVal}
                      onChange={(e) =>
                        handleBalanceChange(acct.id, e.target.value)
                      }
                      aria-label="Actual balance"
                      aria-describedby={`acct-name-${acct.id}`}
                      className="w-full rounded-md border border-hairline bg-surface-base px-3 py-2 text-sm text-ink-primary placeholder:text-ink-secondary"
                    />
                    <span
                      aria-live="polite"
                      className="text-xs text-ink-secondary"
                    >
                      {hasDelta && delta !== null
                        ? formatDelta(delta, acct)
                        : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleCloseMonth()}
            disabled={!step1Complete || isPending}
            aria-disabled={(!step1Complete || isPending) ? "true" : undefined}
            className="mt-4 inline-flex items-center justify-center rounded-md bg-brand-accent-strong px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Close Month
          </button>
        </section>
      )}
    </div>
  );
}
