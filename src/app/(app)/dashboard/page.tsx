import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/require-user";
import { ChecklistCard } from "@/features/dashboard/ChecklistCard";
import { BreathingRoomCard } from "@/features/dashboard/BreathingRoomCard";
import { LoggingGrid } from "@/features/dashboard/LoggingGrid";
import { LogSuccessToast } from "@/features/dashboard/LogSuccessToast";
import { DashboardBudgetsCard } from "@/features/dashboard/DashboardBudgetsCard";
import { DashboardGoalsCard } from "@/features/dashboard/DashboardGoalsCard";
import { getDashboardProfile } from "@/features/dashboard/server/actions";
import { HealthScoreCard } from "@/features/analytics/components/HealthScoreCard";
import { getFamilyStatus } from "@/features/family/server/actions";
import { FamilyRealtimeTrigger } from "@/features/family/components/FamilyRealtimeTrigger";

function BreathingRoomSkeleton() {
  return (
    <div className="h-36 animate-pulse rounded-xl border border-hairline bg-surface-base" />
  );
}

function LoggingGridSkeleton() {
  return (
    <div className="h-48 animate-pulse rounded-xl border border-hairline bg-surface-base" />
  );
}

function DashboardBudgetsSkeleton() {
  return (
    <div className="h-40 animate-pulse rounded-xl border border-hairline bg-surface-base" />
  );
}

function DashboardGoalsSkeleton() {
  return (
    <div className="h-40 animate-pulse rounded-xl border border-hairline bg-surface-base" />
  );
}

function HealthScoreSkeleton() {
  return (
    <div className="h-32 animate-pulse rounded-xl border border-hairline bg-surface-base" />
  );
}

export default async function DashboardPage() {
  const auth = await requireUser();
  if (!auth) redirect("/auth/login");

  const [profileResult, familyStatus] = await Promise.all([
    getDashboardProfile(),
    getFamilyStatus(),
  ]);
  // Show checklist only when fetch succeeds and checklist has not been completed.
  // profileResult.ok === false (DB error) → showChecklist = false (safe fallback).
  const showChecklist =
    profileResult.ok && !profileResult.data.checklist_completed_at;
  const displayName = profileResult.ok
    ? (profileResult.data.display_name ?? null)
    : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      {familyStatus.status === "in_family" && (
        <FamilyRealtimeTrigger familyUnitId={familyStatus.familyUnitId} />
      )}
      <Suspense fallback={null}>
        <LogSuccessToast />
      </Suspense>
      <p className="text-xl font-bold text-ink-primary">
        Hi {displayName ?? "there"}!
      </p>
      <Suspense fallback={<BreathingRoomSkeleton />}>
        <BreathingRoomCard />
      </Suspense>
      <Suspense fallback={<HealthScoreSkeleton />}>
        <HealthScoreCard />
      </Suspense>
      <Suspense fallback={<LoggingGridSkeleton />}>
        <LoggingGrid />
      </Suspense>
      <Suspense fallback={<DashboardBudgetsSkeleton />}>
        <DashboardBudgetsCard />
      </Suspense>
      <Suspense fallback={<DashboardGoalsSkeleton />}>
        <DashboardGoalsCard />
      </Suspense>
      {showChecklist && <ChecklistCard />}
    </div>
  );
}
