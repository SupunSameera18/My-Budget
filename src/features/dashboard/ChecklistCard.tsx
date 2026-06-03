import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { deriveChecklistState } from "@/features/dashboard/checklist";

export async function ChecklistCard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch real transaction count for the "Log your first transaction" item.
  const { count: transactionCount } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  const items = deriveChecklistState({
    transactionCount: transactionCount ?? 0,
    budgetCount: 0, // wired in Story 4.1
    goalCount: 0, // wired in Story 4.5
    familyMemberCount: 0, // wired in Story 7.2
  });

  // markChecklistComplete() is NOT called here — wired in Story 7.2 when all 4 items are done.

  return (
    <section
      aria-label="Setup checklist"
      className="rounded-xl border border-hairline bg-card p-4 shadow-sm"
    >
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
        Get started
      </p>
      <h2 className="mb-4 text-base font-bold text-ink-primary">
        A few things to set up
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex min-h-[44px] items-center justify-between rounded-lg bg-surface-inset px-4 py-2 text-sm font-medium text-ink-primary hover:bg-surface-raised active:opacity-80"
            >
              <span
                className={item.done ? "text-ink-secondary line-through" : ""}
              >
                {item.label}
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-ink-secondary"
                strokeWidth={1.75}
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
