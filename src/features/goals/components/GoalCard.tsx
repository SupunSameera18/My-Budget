"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { getDisplayName } from "@/lib/display-names";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SharedBadge } from "@/features/family/components/SharedBadge";
import { ContributeSheet } from "./ContributeSheet";
import { EditGoalTargetSheet } from "./EditGoalTargetSheet";
import { GoalHistorySheet } from "./GoalHistorySheet";
import { reclassifyGoal } from "@/features/goals/server/actions";
import type { GoalWithProgress } from "@/features/goals/schema";

interface GoalCardProps {
  goal: GoalWithProgress;
  currency: string;
  isFamilyMode: boolean;
  viewerUserId?: string;
}

export function GoalCard({
  goal,
  currency,
  isFamilyMode,
  viewerUserId = "",
}: GoalCardProps) {
  const router = useRouter();
  const [contributeOpen, setContributeOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reclassifyConfirmOpen, setReclassifyConfirmOpen] = useState(false);
  const [reclassifyTarget, setReclassifyTarget] = useState<boolean | null>(
    null,
  );
  const [reclassifyPending, setReclassifyPending] = useState(false);
  const [reclassifyStatus, setReclassifyStatus] = useState("");

  async function handleReclassify() {
    if (reclassifyTarget === null) return;
    setReclassifyStatus("");
    setReclassifyPending(true);
    try {
      const fd = new FormData();
      fd.set("goal_id", goal.id);
      fd.set("to_shared", reclassifyTarget ? "true" : "false");
      const result = await reclassifyGoal(fd);
      if (!result.ok) {
        setReclassifyStatus(result.error.message);
      } else {
        setReclassifyConfirmOpen(false);
        setReclassifyTarget(null);
        router.refresh();
      }
    } finally {
      setReclassifyPending(false);
    }
  }

  const isMet = goal.pctUsed >= 100;
  const hasSurplus = goal.currentMinor > goal.target_minor;
  const surplusMinor = Math.max(0, goal.currentMinor - goal.target_minor);

  const showBreakdown =
    goal.is_shared &&
    isFamilyMode &&
    (goal.myContributionMinor !== undefined ||
      goal.partnerContributionMinor !== undefined) &&
    ((goal.myContributionMinor ?? 0) > 0 ||
      (goal.partnerContributionMinor ?? 0) > 0);

  return (
    <>
      <article className="rounded-xl border border-hairline bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-base font-semibold text-ink-primary">
            {goal.name}
          </h2>
          {/* SharedBadge is always in DOM; renders null when conditions not met */}
          <SharedBadge
            isFamilyMode={isFamilyMode}
            isShared={goal.is_shared}
            ariaLabel="Shared goal"
          />
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
              <span className="inline-flex items-center rounded-full border-2 border-brand-accent px-3 py-1 text-xs font-semibold text-brand-accent">
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

        {/* Contributor breakdown for Shared Goals (optional — only shown in family mode) */}
        {showBreakdown && (
          <dl className="mb-4 flex flex-col gap-1 text-xs text-ink-secondary">
            <div className="flex justify-between">
              <dt>You</dt>
              <dd>{formatMoney(goal.myContributionMinor ?? 0, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>
                {goal.partnerContributorId
                  ? getDisplayName(goal.partnerContributorId, viewerUserId)
                  : "Partner"}
              </dt>
              <dd>
                {formatMoney(goal.partnerContributionMinor ?? 0, currency)}
              </dd>
            </div>
          </dl>
        )}

        {/* ARIA live region for reclassify feedback — always in DOM */}
        <p role="status" aria-live="polite" className="sr-only">
          {reclassifyStatus}
        </p>

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
          {goal.isOwner && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              aria-label={`Edit target for ${goal.name}`}
              className="min-h-[44px] flex-1 rounded-md border border-hairline bg-surface-base px-4 text-sm text-ink-secondary"
            >
              Edit target
            </button>
          )}
        </div>

        {/* Secondary actions row */}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label={`View contribution history for ${goal.name}`}
            className="min-h-[36px] rounded-md border border-hairline bg-surface-base px-3 text-xs text-ink-secondary"
          >
            History
          </button>

          {/* Reclassify — owner only, conditional on family mode */}
          {goal.isOwner && isFamilyMode && !goal.is_shared && (
            <button
              type="button"
              onClick={() => {
                setReclassifyTarget(true);
                setReclassifyStatus("");
                setReclassifyConfirmOpen(true);
              }}
              aria-label={`Make ${goal.name} a shared goal`}
              className="min-h-[36px] rounded-md border border-hairline bg-surface-base px-3 text-xs text-ink-secondary"
            >
              Make shared
            </button>
          )}
          {goal.isOwner && goal.is_shared && (
            <button
              type="button"
              onClick={() => {
                setReclassifyTarget(false);
                setReclassifyStatus("");
                setReclassifyConfirmOpen(true);
              }}
              aria-label={`Make ${goal.name} a personal goal`}
              className="min-h-[36px] rounded-md border border-hairline bg-surface-base px-3 text-xs text-ink-secondary"
            >
              Make personal
            </button>
          )}
        </div>

        {/* Reclassify confirmation alertdialog */}
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={`reclassify-goal-title-${goal.id}`}
          hidden={!reclassifyConfirmOpen || undefined}
          className="mt-3 rounded-lg border border-hairline bg-surface-inset p-4"
        >
          <p
            id={`reclassify-goal-title-${goal.id}`}
            className="mb-3 text-sm font-medium text-ink-primary"
          >
            {reclassifyTarget
              ? `Make "${goal.name}" shared with your partner?`
              : `Make "${goal.name}" personal (visible only to you)?`}
          </p>
          {reclassifyStatus && (
            <p className="mb-2 text-xs text-destructive">{reclassifyStatus}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setReclassifyConfirmOpen(false);
                setReclassifyTarget(null);
                setReclassifyStatus("");
              }}
              disabled={reclassifyPending}
              className="min-h-[36px] flex-1 rounded-md border border-hairline bg-card text-sm text-ink-secondary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleReclassify()}
              disabled={reclassifyPending}
              className="min-h-[36px] flex-1 rounded-md bg-brand-accent-strong text-sm font-medium text-white disabled:opacity-50"
            >
              {reclassifyPending
                ? "Saving…"
                : reclassifyTarget
                  ? "Make shared"
                  : "Make personal"}
            </button>
          </div>
        </div>
      </article>

      <ContributeSheet
        goalId={goal.id}
        goalName={goal.name}
        currency={currency}
        open={contributeOpen}
        onOpenChange={setContributeOpen}
      />

      {goal.isOwner && (
        <EditGoalTargetSheet
          goalId={goal.id}
          goalName={goal.name}
          currentTargetMinor={goal.target_minor}
          currency={currency}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      <GoalHistorySheet
        goalId={goal.id}
        goalName={goal.name}
        currency={currency}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </>
  );
}
