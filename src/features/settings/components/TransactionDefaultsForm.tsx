"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import type { TransactionDefaults } from "@/features/transactions/schema";
import { saveTransactionDefaults } from "@/features/transactions/server/actions";

interface TransactionDefaultsFormProps {
  initialDefaults: TransactionDefaults | null;
  isFamilyMode: boolean;
}

type DefaultType = "personal" | "shared";

const TYPE_OPTIONS: { value: DefaultType; label: string }[] = [
  { value: "personal", label: "Personal" },
  { value: "shared", label: "Shared" },
];

function handleRadioKeyDown<T extends string>(
  e: React.KeyboardEvent<HTMLDivElement>,
  options: { value: T }[],
  currentValue: T,
  onChange: (v: T) => void,
) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key))
    return;
  e.preventDefault();
  const idx = options.findIndex((o) => o.value === currentValue);
  const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
  const nextIdx = (idx + delta + options.length) % options.length;
  onChange(options[nextIdx].value);
  const radios =
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
  radios[nextIdx]?.focus();
}

export function TransactionDefaultsForm({
  initialDefaults,
  isFamilyMode,
}: TransactionDefaultsFormProps) {
  const [defaults, setDefaults] = useState<TransactionDefaults>(
    initialDefaults ?? {},
  );
  const [isPending, startTransition] = useTransition();
  const [statusMsg, setStatusMsg] = useState("");
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentType: DefaultType = defaults.defaultType ?? "personal";

  // Auto-clear status message after 2 s to prevent stale SR re-announce
  useEffect(() => {
    if (!statusMsg) return;
    clearTimerRef.current = setTimeout(() => setStatusMsg(""), 2000);
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, [statusMsg]);

  function handleTypeChange(value: DefaultType) {
    if (isPending) return;
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
            onKeyDown={(e) =>
              handleRadioKeyDown(e, TYPE_OPTIONS, currentType, handleTypeChange)
            }
            className="flex gap-1 rounded-lg border border-hairline bg-surface-base p-1"
          >
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={currentType === opt.value}
                tabIndex={currentType === opt.value ? 0 : -1}
                aria-disabled={isPending ? "true" : undefined}
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
      </div>
    </section>
  );
}
