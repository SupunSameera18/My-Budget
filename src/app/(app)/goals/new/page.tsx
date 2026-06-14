import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/require-user";
import { GoalForm } from "@/features/goals/components/GoalForm";

export default async function NewGoalPage() {
  const auth = await requireUser();
  if (!auth) redirect("/auth/login");

  const [profileResult, memberResult] = await Promise.all([
    auth.supabase
      .from("profiles")
      .select("currency")
      .eq("user_id", auth.user.id)
      .single(),
    auth.supabase
      .from("family_members")
      .select("join_date")
      .eq("user_id", auth.user.id)
      .maybeSingle(),
  ]);

  const currency = profileResult.data?.currency ?? "USD";
  const isFamilyMode = !!memberResult.data;

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-6">
        <Link
          href="/goals"
          className="text-sm text-ink-secondary hover:text-ink-primary"
        >
          ← Goals
        </Link>
        <h1 className="mt-2 text-xl font-bold text-ink-primary">Create Goal</h1>
      </div>

      <GoalForm currency={currency} isFamilyMode={isFamilyMode} />
    </div>
  );
}
