import Link from "next/link";
import { getGoals } from "@/features/goals/server/actions";
import { ProgressBar } from "@/components/ui/ProgressBar";

export async function DashboardGoalsCard() {
  const result = await getGoals();
  if (!result.ok) return null;

  const { goals } = result.data;
  const totalGoals = goals.length;

  if (totalGoals === 0) {
    return (
      <section
        aria-label="Goals"
        className="rounded-xl border border-hairline bg-card p-4 shadow-sm"
      >
        <h2 className="mb-2 text-base font-bold text-ink-primary">Goals</h2>
        <p className="text-sm text-ink-secondary">
          No goals yet.{" "}
          <Link
            href="/goals/new"
            className="text-brand-accent-strong underline"
          >
            Create one
          </Link>{" "}
          to start saving toward a target.
        </p>
      </section>
    );
  }

  const displayGoals = [...goals]
    .sort((a, b) => b.pctUsed - a.pctUsed || a.name.localeCompare(b.name))
    .slice(0, 3);

  return (
    <section
      aria-label="Goals"
      className="rounded-xl border border-hairline bg-card p-4 shadow-sm"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-ink-primary">Goals</h2>
        <Link
          href="/goals"
          className="text-xs text-ink-secondary hover:text-ink-primary"
        >
          See all →
        </Link>
      </div>
      <div className="flex flex-col gap-3">
        {displayGoals.map((goal) => {
          const isMet = goal.pctUsed >= 100;
          return (
            <div key={goal.id}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="truncate font-medium text-ink-primary">
                  {goal.name}
                </span>
                {isMet ? (
                  <span className="ml-2 inline-flex shrink-0 items-center rounded-full bg-[#4FA6A6]/20 px-2.5 py-0.5 text-xs font-semibold text-[#1F7A78] dark:bg-[#4FA6A6]/30 dark:text-[#5FBBBB]">
                    Met!
                  </span>
                ) : (
                  <span className="ml-2 shrink-0 tabular-nums text-ink-secondary">
                    {Math.round(goal.pctUsed)}%
                  </span>
                )}
              </div>
              <ProgressBar
                pctUsed={goal.pctUsed}
                limitMarker={false}
                noAmber={true}
              />
            </div>
          );
        })}
      </div>
      {totalGoals > 3 && (
        <p className="mt-3 text-xs text-ink-secondary">
          +{totalGoals - 3} more ·{" "}
          <Link href="/goals" className="underline">
            See all
          </Link>
        </p>
      )}
    </section>
  );
}
