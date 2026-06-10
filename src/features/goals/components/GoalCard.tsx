"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ContributeSheet } from "./ContributeSheet";
import { EditGoalTargetSheet } from "./EditGoalTargetSheet";
import type { GoalWithProgress } from "@/features/goals/schema";

interface GoalCardProps {
  goal: GoalWithProgress;
  currency: string;
}

export function GoalCard({ goal, currency }: GoalCardProps) {
  const [contributeOpen, setContributeOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const isMet = goal.pctUsed >= 100;
  const hasSurplus = goal.currentMinor > goal.target_minor;
  const surplusMinor = Math.max(0, goal.currentMinor - goal.target_minor);

  return (
    <>
      <article className="rounded-xl border border-hairline bg-card p-4 shadow-sm">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-ink-primary">
            {goal.name}
          </h2>
        </div>

        <ProgressBar
          pctUsed={goal.pctUsed}
          limitMarker={false}
          noAmber={true}
          ariaLabel={goal.name}
          className="mb-2"
        />

        {/* % complete / Met! / surplus */}
        <div className="mt-1 min-h-[1.5rem]">
          {isMet ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="inline-flex items-center rounded-full bg-[#4FA6A6]/20 px-3 py-1 text-xs font-semibold text-[#1F7A78] dark:bg-[#4FA6A6]/30 dark:text-[#5FBBBB]">
                Met!
              </span>
              {hasSurplus && (
                <span className="text-xs text-ink-secondary">
                  +{formatMoney(surplusMinor, currency)} over target
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink-secondary">
              {Math.floor(goal.pctUsed)}% complete
            </p>
          )}
        </div>

        <div className="mb-4 mt-2 flex items-center justify-between text-sm">
          <span className="text-ink-secondary">
            {formatMoney(goal.currentMinor, currency)} of{" "}
            {formatMoney(goal.target_minor, currency)}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setContributeOpen(true)}
            aria-label={`Contribute to ${goal.name}`}
            className="min-h-[44px] flex-1 rounded-md bg-brand-accent-strong px-4 text-sm font-medium text-white"
          >
            Contribute
          </button>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            aria-label={`Edit target for ${goal.name}`}
            className="min-h-[44px] flex-1 rounded-md border border-hairline bg-surface-base px-4 text-sm text-ink-secondary"
          >
            Edit target
          </button>
        </div>
      </article>

      <ContributeSheet
        goalId={goal.id}
        goalName={goal.name}
        currency={currency}
        open={contributeOpen}
        onOpenChange={setContributeOpen}
      />

      <EditGoalTargetSheet
        goalId={goal.id}
        goalName={goal.name}
        currentTargetMinor={goal.target_minor}
        currency={currency}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}
