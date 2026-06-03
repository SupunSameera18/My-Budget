import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/format";
import { currentMonthBoundaries } from "@/lib/period";

export async function BreathingRoomCard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Currency for display — defaults to USD on profile fetch failure
  const { data: profile } = await supabase
    .from("profiles")
    .select("currency")
    .eq("user_id", user.id)
    .single();
  const currency = profile?.currency ?? "USD";

  // Period boundaries for the current calendar month (UTC)
  const { start, end } = currentMonthBoundaries();

  // Fetch transactions for current period — type is 'income' or 'expense'
  // RLS (owner-only) already scopes to user.id; eq filter is defensive
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("amount_minor, type")
    .eq("user_id", user.id)
    .gte("date", start)
    .lte("date", end);

  if (error) return null; // DB error → card absent rather than crash

  // Zero-transaction empty state (no data at all vs. $0 computed balance)
  const isEmpty = transactions !== null && transactions.length === 0;

  if (isEmpty) {
    return (
      <section
        aria-label="Breathing Room"
        className="rounded-xl border border-hairline bg-card p-4 shadow-sm"
      >
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          This Month
        </p>
        <h2 className="mb-3 text-base font-bold text-ink-primary">
          Breathing Room
        </h2>
        <p className="text-sm text-ink-secondary">
          Nothing tracked yet this month.
        </p>
        <p className="mt-1 text-sm text-ink-secondary">
          Tap + to log your first transaction.
        </p>
      </section>
    );
  }

  // Server-side computation — browser never receives raw minor values
  const incomeSum =
    transactions
      ?.filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount_minor, 0) ?? 0;
  const expenseSum =
    transactions
      ?.filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount_minor, 0) ?? 0;
  const breathingRoomMinor = incomeSum - expenseSum;
  const isNegative = breathingRoomMinor < 0;

  return (
    <section
      aria-label="Breathing Room"
      className="rounded-xl border border-hairline bg-card p-4 shadow-sm"
    >
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
        This Month
      </p>
      <h2 className="mb-2 text-base font-bold text-ink-primary">
        Breathing Room
      </h2>
      <p
        className={`text-4xl font-bold ${
          isNegative ? "text-breathing-low-text" : "text-ink-primary"
        }`}
        style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "-0.8px" }}
      >
        {formatMoney(breathingRoomMinor, currency)}
      </p>
      <p
        className={`mt-2 text-sm ${
          isNegative ? "text-breathing-low-text" : "text-ink-secondary"
        }`}
      >
        {isNegative
          ? "Getting tight — go gently for a bit."
          : "left to spend this month"}
      </p>
    </section>
  );
}
