"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ErrorCode, err, ok, type Result } from "@/lib/errors";
import {
  logTransactionSchema,
  type TransactionFormData,
} from "@/features/transactions/schema";
import { getAccounts } from "@/features/accounts/server/actions";

export async function getTransactionFormData(): Promise<
  Result<TransactionFormData>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err(ErrorCode.TransactionCreateFailed, "Not authenticated");

  // Reuse existing getAccounts() action — returns active (non-archived) accounts only
  const accountsResult = await getAccounts();
  if (!accountsResult.ok) {
    return err(ErrorCode.TransactionCreateFailed, "Failed to load accounts");
  }
  const accounts = accountsResult.data;

  // Active categories (not archived), expense first then income (most common first)
  const { data: categories, error: catError } = await supabase
    .from("categories")
    .select("id, name, type")
    .is("archived_at", null)
    .order("type", { ascending: true }) // 'expense' < 'income' alphabetically = expense first
    .order("name", { ascending: true });

  if (catError) {
    return err(ErrorCode.TransactionCreateFailed, "Failed to load categories");
  }

  // Profile currency for display
  const { data: profile } = await supabase
    .from("profiles")
    .select("currency")
    .eq("user_id", user.id)
    .single();

  const currency = profile?.currency ?? "USD";

  // Default account: most recent transaction's account_id, else first account
  const { data: lastTxn } = await supabase
    .from("transactions")
    .select("account_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const defaultAccountId = lastTxn?.account_id ?? accounts[0]?.id ?? null;

  return ok({
    accounts,
    categories: (categories ?? []) as TransactionFormData["categories"],
    currency,
    defaultAccountId,
  });
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

  // Convert display decimal to integer minor units (2 decimal places for all v1 currencies)
  const amountMinor = Math.round(parseFloat(parsed.data.amount_display) * 100);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return err(ErrorCode.TransactionCreateFailed, "Not authenticated");
  }

  // Check if this is the user's first transaction (before insert — for PostHog + FR-3 lock)
  const { count: existingCount } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);
  const isFirstTransaction = existingCount !== null && existingCount === 0;

  // Atomic insert + balance update via RPC
  const { error: rpcError } = await supabase.rpc("rpc_log_transaction", {
    p_account_id: parsed.data.account_id,
    p_category_id: parsed.data.category_id,
    p_amount_minor: amountMinor,
    p_date: parsed.data.date,
    p_note: parsed.data.note ?? null,
  });

  if (rpcError) {
    return err(
      ErrorCode.TransactionCreateFailed,
      "Failed to log transaction. Please try again.",
    );
  }

  // Fire PostHog event (non-fatal: failure must not block the save).
  // posthog.ts is "use client" only — use HTTP API for server-side events.
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
  return ok();
  // Client navigates to /dashboard via router.push() — NOT a server-side redirect().
  // Rationale: calling redirect() in a Server Action leaves the Result type undefined on
  // the client side, making TypeScript error handling unpredictable. The established
  // LoginForm pattern: action returns Result<void>, client does router.push on success.
}
