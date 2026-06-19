import Link from "next/link";
import { ChevronRight, X } from "lucide-react";
import { requireUser } from "@/lib/supabase/require-user";
import { deriveChecklistState } from "@/features/dashboard/checklist";
import { markChecklistComplete } from "@/features/dashboard/server/actions";

export async function ChecklistCard() {
  const auth = await requireUser();
  if (!auth) return null;
  const { supabase, user } = auth;

  const [
    { count: transactionCount },
    { count: budgetCount },
    { count: goalCount },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("archived_at", null),
    supabase
      .from("budgets")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("archived_at", null),
    supabase
      .from("goals")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("archived_at", null),
  ]);

  const items = deriveChecklistState({
    transactionCount: transactionCount ?? 0,
    budgetCount: budgetCount ?? 0,
    goalCount: goalCount ?? 0,
    familyMemberCount: 0, // wired in Story 7.2
  });

  // The X button (below) dismisses the checklist now via markChecklistComplete().
  // Auto-dismiss when all 4 items are genuinely done is wired in Story 7.2, once the
  // budget/goal/family counts above stop being hardcoded 0 (only transactionCount is real today).

  return (
    <section
      aria-label="Setup checklist"
      className="rounded-xl border border-hairline bg-card p-4 shadow-sm"
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
            Get started
          </p>
          <h2 className="text-base font-bold text-ink-primary">
            A few things to set up
          </h2>
        </div>
        <form action={markChecklistComplete} noValidate>
          <button
            type="submit"
            aria-label="Dismiss setup checklist"
            className="rounded-md p-1.5 text-ink-secondary transition-colors hover:bg-surface-inset hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            {item.done ? (
              <div className="flex min-h-[44px] items-center justify-between rounded-lg bg-surface-inset px-4 py-2 text-sm font-medium">
                <span className="text-ink-secondary line-through">
                  {item.label}
                </span>
                <ChevronRight
                  className="text-ink-secondary/40 h-4 w-4 shrink-0"
                  strokeWidth={1.75}
                />
              </div>
            ) : (
              <Link
                href={item.href}
                className="flex min-h-[44px] items-center justify-between rounded-lg bg-surface-inset px-4 py-2 text-sm font-medium text-ink-primary transition-all hover:brightness-95 active:brightness-90"
              >
                <span>{item.label}</span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-ink-secondary"
                  strokeWidth={1.75}
                />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
