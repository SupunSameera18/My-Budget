import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Goals" };
import Link from "next/link";
import { requireUser } from "@/lib/supabase/require-user";
import { EmptyState } from "@/components/feedback/EmptyState";
import { GoalCard } from "@/features/goals/components/GoalCard";
import { getGoals } from "@/features/goals/server/actions";

export default async function GoalsPage() {
  const auth = await requireUser();
  if (!auth) redirect("/auth/login");
  const { user } = auth;

  const result = await getGoals();

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink-primary">Goals</h1>
        <Link
          href="/goals/new"
          className="inline-flex min-h-[44px] items-center rounded-md bg-brand-accent-strong px-4 py-2 text-sm font-semibold text-white hover:opacity-90 active:opacity-80"
        >
          New Goal
        </Link>
      </div>

      {!result.ok ? (
        <div className="rounded-xl border border-hairline bg-card p-6 text-center">
          <p className="text-sm text-ink-secondary">
            Failed to load goals. Try again later.
          </p>
        </div>
      ) : result.data.goals.length === 0 ? (
        <EmptyState
          heading="No goals yet"
          body="Set a target and start building toward it."
          actionLabel="Create your first goal"
          actionHref="/goals/new"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {result.data.goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              currency={result.data.currency}
              isFamilyMode={result.data.isFamilyMode}
              viewerUserId={user.id}
              viewerName={result.data.viewerName}
              partnerName={result.data.partnerName}
            />
          ))}
        </div>
      )}
    </div>
  );
}
