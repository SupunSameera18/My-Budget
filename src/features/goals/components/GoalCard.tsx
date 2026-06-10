"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ContributeSheet } from "./ContributeSheet";
import type { GoalWithProgress } from "@/features/goals/schema";

interface GoalCardProps {
  goal: GoalWithProgress;
  currency: string;
}

export function GoalCard({ goal, currency }: GoalCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <article className="rounded-xl border border-hairline bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-ink-primary">
            {goal.name}
          </h2>
          <span className="text-sm text-ink-secondary">
            {goal.pctUsed.toFixed(0)}%
          </span>
        </div>

        <ProgressBar
          pctUsed={goal.pctUsed}
          limitMarker={false}
          ariaLabel={goal.name}
          className="mb-3"
        />

        <div className="mb-4 flex items-center justify-between text-sm">
          <span className="text-ink-secondary">
            {formatMoney(goal.currentMinor, currency)} of{" "}
            {formatMoney(goal.target_minor, currency)}
          </span>
          {goal.remaining_minor <= 0 && (
            <span className="font-medium text-brand-accent-strong">
              Goal met!
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={`Contribute to ${goal.name}`}
          className="min-h-[44px] w-full rounded-md bg-brand-accent-strong px-4 text-sm font-medium text-white"
        >
          Contribute
        </button>
      </article>

      <ContributeSheet
        goalId={goal.id}
        goalName={goal.name}
        currency={currency}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}
