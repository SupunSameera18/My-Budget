import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChecklistCard } from "@/features/dashboard/ChecklistCard";
import { BreathingRoomCard } from "@/features/dashboard/BreathingRoomCard";
import { getDashboardProfile } from "@/features/dashboard/server/actions";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const profileResult = await getDashboardProfile();
  // Show checklist only when fetch succeeds and checklist has not been completed.
  // profileResult.ok === false (DB error) → showChecklist = false (safe fallback).
  const showChecklist =
    profileResult.ok && !profileResult.data.checklist_completed_at;
  const displayName = profileResult.ok
    ? (profileResult.data.display_name ?? null)
    : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <p className="text-xl font-bold text-ink-primary">
        Hi {displayName ?? "there"}!
      </p>
      <BreathingRoomCard />
      {showChecklist && <ChecklistCard />}
    </div>
  );
}
