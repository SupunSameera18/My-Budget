"use client";

import { useState, useTransition } from "react";
import type { TransactionDefaults } from "@/features/transactions/schema";
import { saveTransactionDefaults } from "@/features/transactions/server/actions";

interface TransactionDefaultsFormProps {
  initialDefaults: TransactionDefaults | null;
  isFamilyMode: boolean;
}

type DefaultType = "personal" | "shared";
type DefaultSplitMethod = "equal" | "percentage" | "fixed" | "none";

const TYPE_OPTIONS: { value: DefaultType; label: string }[] = [
  { value: "personal", label: "Personal" },
  { value: "shared", label: "Shared" },
];

const SPLIT_OPTIONS: { value: DefaultSplitMethod; label: string }[] = [
  { value: "equal", label: "Equal" },
  { value: "percentage", label: "Percentage" },
  { value: "fixed", label: "Fixed" },
  { value: "none", label: "None" },
];

export function TransactionDefaultsForm({
  initialDefaults,
  isFamilyMode,
}: TransactionDefaultsFormProps) {
  const [defaults, setDefaults] = useState<TransactionDefaults>(
    initialDefaults ?? {},
  );
  const [isPending, startTransition] = useTransition();
  const [statusMsg, setStatusMsg] = useState("");

  const currentType: DefaultType = defaults.defaultType ?? "personal";
  const currentSplit: DefaultSplitMethod =
    defaults.defaultSplitMethod ?? "equal";

  function handleTypeChange(value: DefaultType) {
    const prev = defaults;
    const next: TransactionDefaults = { ...defaults, defaultType: value };
    setDefaults(next);
    setStatusMsg("");
    startTransition(async () => {
      const result = await saveTransactionDefaults(next);
      if (result.ok) {
        setStatusMsg("Saved");
      } else {
        setDefaults(prev);
        setStatusMsg("Failed to save");
      }
    });
  }

  function handleSplitChange(value: DefaultSplitMethod) {
    const prev = defaults;
    const next: TransactionDefaults = {
      ...defaults,
      defaultSplitMethod: value,
    };
    setDefaults(next);
    setStatusMsg("");
    startTransition(async () => {
      const result = await saveTransactionDefaults(next);
      if (result.ok) {
        setStatusMsg("Saved");
      } else {
        setDefaults(prev);
        setStatusMsg("Failed to save");
      }
    });
  }

  if (!isFamilyMode) return null;

  return (
    <section aria-labelledby="tx-defaults-heading">
      <h2
        id="tx-defaults-heading"
        className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-secondary"
      >
        Transaction defaults
      </h2>
      <div aria-live="polite" role="status" className="sr-only">
        {statusMsg}
      </div>
      <div className="flex flex-col gap-3 rounded-lg bg-card p-4 shadow-sm">
        {/* Default type */}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-ink-secondary">Default type</p>
          <div
            role="radiogroup"
            aria-label="Default transaction type"
            className="flex gap-1 rounded-lg border border-hairline bg-surface-base p-1"
          >
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={currentType === opt.value}
                aria-disabled={isPending}
                disabled={isPending}
                onClick={() => handleTypeChange(opt.value)}
                className={`min-h-[44px] flex-1 rounded-md text-sm font-medium transition-colors ${
                  currentType === opt.value
                    ? "bg-brand-accent-strong text-white"
                    : "text-ink-secondary hover:bg-surface-inset"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Default split method */}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-ink-secondary">
            Default split method
          </p>
          <div
            role="radiogroup"
            aria-label="Default split method"
            className="flex gap-1 rounded-lg border border-hairline bg-surface-base p-1"
          >
            {SPLIT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={currentSplit === opt.value}
                aria-disabled={isPending}
                disabled={isPending}
                onClick={() => handleSplitChange(opt.value)}
                className={`min-h-[44px] flex-1 rounded-md text-sm font-medium transition-colors ${
                  currentSplit === opt.value
                    ? "bg-brand-accent-strong text-white"
                    : "text-ink-secondary hover:bg-surface-inset"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
