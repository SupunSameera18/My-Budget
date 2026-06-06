"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/require-user";
import { ErrorCode, err, ok, type Result } from "@/lib/errors";
import {
  logTransactionSchema,
  type TransactionFormData,
} from "@/features/transactions/schema";
import { getAccounts } from "@/features/accounts/server/actions";
import { currentMonthBoundaries } from "@/lib/period";
import { dedupeRecentNotes } from "@/lib/note-suggestions";

export async function getTransactionFormData(): Promise<
  Result<TransactionFormData>
> {
  try {
    const auth = await requireUser();
    if (!auth)
      return err(ErrorCode.TransactionCreateFailed, "Not authenticated");
    const { supabase, user } = auth;

    const accountsResult = await getAccounts();
    if (!accountsResult.ok) {
      return err(ErrorCode.TransactionCreateFailed, "Failed to load accounts");
    }
    const accounts = accountsResult.data;

    const { data: categories, error: catError } = await supabase
      .from("categories")
      .select("id, name, type")
      .is("archived_at", null)
      .order("type", { ascending: true })
      .order("name", { ascending: true });

    if (catError) {
      return err(
        ErrorCode.TransactionCreateFailed,
        "Failed to load categories",
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("currency, subcategories_enabled")
      .eq("user_id", user.id)
      .single();

    const currency = profile?.currency ?? "USD";
    const subcategoriesEnabled = profile?.subcategories_enabled ?? false;

    let subcategories: { id: string; name: string; category_id: string }[] = [];
    if (subcategoriesEnabled) {
      const { data: subcatsData } = await supabase
        .from("subcategories")
        .select("id, name, category_id")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("created_at", { ascending: true });
      subcategories = subcatsData ?? [];
    }

    const { data: lastTxn } = await supabase
      .from("transactions")
      .select("account_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const defaultAccountId = lastTxn?.account_id ?? accounts[0]?.id ?? null;

    const { start, end } = currentMonthBoundaries();
    const { data: monthTxns } = await supabase
      .from("transactions")
      .select("amount_minor, type")
      .eq("user_id", user.id)
      .gte("date", start)
      .lte("date", end);

    const incomeSum = (monthTxns ?? [])
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + t.amount_minor, 0);
    const expenseSum = (monthTxns ?? [])
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount_minor, 0);
    const currentBreathingRoomMinor = incomeSum - expenseSum;

    return ok({
      accounts,
      categories: (categories ?? []) as TransactionFormData["categories"],
      currency,
      defaultAccountId,
      subcategoriesEnabled,
      subcategories: subcategories as TransactionFormData["subcategories"],
      currentBreathingRoomMinor,
    });
  } catch {
    return err(
      ErrorCode.TransactionCreateFailed,
      "An unexpected error occurred. Please try again.",
    );
  }
}

export async function logTransaction(
  formData: FormData,
): Promise<Result<void>> {
  const raw = Object.fromEntries(formData);
  const parsed = logTransactionSchema.safeParse(raw);

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return err(
      ErrorCode.TransactionCreateFailed,
      first?.message ?? "Invalid transaction data",
      String(first?.path[0] ?? ""),
    );
  }

  const amountMinor = Math.round(parseFloat(parsed.data.amount_display) * 100);

  const subcategoryId =
    parsed.data.subcategory_id && parsed.data.subcategory_id !== ""
      ? parsed.data.subcategory_id
      : null;

  try {
    const auth = await requireUser();
    if (!auth) {
      return err(ErrorCode.TransactionCreateFailed, "Not authenticated");
    }
    const { supabase, user } = auth;

    const { count: existingCount } = await supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    const isFirstTransaction = existingCount !== null && existingCount === 0;

    const { error: rpcError } = await supabase.rpc("rpc_log_transaction", {
      p_account_id: parsed.data.account_id,
      p_category_id: parsed.data.category_id,
      p_amount_minor: amountMinor,
      p_date: parsed.data.date,
      p_note: parsed.data.note ?? null,
      p_subcategory_id: subcategoryId,
    });

    if (rpcError) {
      return err(
        ErrorCode.TransactionCreateFailed,
        "Failed to log transaction. Please try again.",
      );
    }

    const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (posthogKey) {
      const posthogHost =
        process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
      await fetch(`${posthogHost}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: posthogKey,
          event: "transaction_logged",
          distinct_id: user.id,
          properties: {
            user_id: user.id,
            category_id: parsed.data.category_id,
            account_id: parsed.data.account_id,
            is_first_transaction: isFirstTransaction,
          },
        }),
      }).catch(() => {
        // Analytics failure is non-fatal — never block the user path
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/transactions/new");
    revalidatePath("/transactions");
    return ok();
    // Client navigates to /dashboard via router.push() — NOT a server-side redirect().
    // Rationale: calling redirect() in a Server Action leaves the Result type undefined on
    // the client side, making TypeScript error handling unpredictable. The established
    // LoginForm pattern: action returns Result<void>, client does router.push on success.
  } catch {
    return err(
      ErrorCode.TransactionCreateFailed,
      "An unexpected error occurred. Please try again.",
    );
  }
}

export async function getSuggestedNotes(categoryId: string): Promise<string[]> {
  try {
    if (!categoryId) return [];
    const auth = await requireUser();
    if (!auth) return [];
    const { supabase, user } = auth;
    const { data } = await supabase
      .from("transactions")
      .select("note, created_at")
      .eq("user_id", user.id) // explicit user_id filter (defense-in-depth)
      .eq("category_id", categoryId)
      .not("note", "is", null)
      .order("created_at", { ascending: false })
      .limit(50); // fetch enough to dedup to 5 distinct
    return dedupeRecentNotes(data ?? []);
  } catch {
    return [];
  }
}
