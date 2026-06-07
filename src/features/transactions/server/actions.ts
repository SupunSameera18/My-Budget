"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/require-user";
import { ErrorCode, err, ok, type Result } from "@/lib/errors";
import {
  logTransactionSchema,
  editTransactionSchema,
  type TransactionFormData,
  type EditTransactionFormData,
  type ActivityTrailEntry,
} from "@/features/transactions/schema";
import { z } from "zod";
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
      .is("archived_at", null)
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
      .lte("date", end)
      .is("archived_at", null);

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
      .is("archived_at", null)
      .not("note", "is", null)
      .order("created_at", { ascending: false })
      .limit(50); // fetch enough to dedup to 5 distinct
    return dedupeRecentNotes(data ?? []);
  } catch {
    return [];
  }
}

export async function getTransaction(
  id: string,
): Promise<Result<EditTransactionFormData>> {
  try {
    const auth = await requireUser();
    if (!auth)
      return err(ErrorCode.TransactionFetchFailed, "Not authenticated");
    const { supabase, user } = auth;

    const { data: transaction, error: txnError } = await supabase
      .from("transactions")
      .select(
        "id, user_id, account_id, category_id, subcategory_id, amount_minor, date, note, type, created_at, updated_at, archived_at",
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .is("archived_at", null)
      .maybeSingle();

    if (txnError) {
      return err(
        ErrorCode.TransactionFetchFailed,
        "Failed to load transaction",
      );
    }
    if (!transaction) {
      return err(ErrorCode.TransactionFetchFailed, "Transaction not found");
    }

    const accountsResult = await getAccounts();
    if (!accountsResult.ok) {
      return err(ErrorCode.TransactionFetchFailed, "Failed to load accounts");
    }

    const { data: categories, error: catError } = await supabase
      .from("categories")
      .select("id, name, type")
      .is("archived_at", null)
      .order("type", { ascending: true })
      .order("name", { ascending: true });

    if (catError) {
      return err(ErrorCode.TransactionFetchFailed, "Failed to load categories");
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

    return ok({
      transaction: transaction as EditTransactionFormData["transaction"],
      accounts: accountsResult.data,
      categories: (categories ?? []) as EditTransactionFormData["categories"],
      currency,
      subcategoriesEnabled,
      subcategories: subcategories as EditTransactionFormData["subcategories"],
    });
  } catch {
    return err(
      ErrorCode.TransactionFetchFailed,
      "An unexpected error occurred. Please try again.",
    );
  }
}

export async function editTransaction(
  transactionId: string,
  formData: FormData,
): Promise<Result<void>> {
  try {
    const auth = await requireUser();
    if (!auth)
      return err(ErrorCode.TransactionUpdateFailed, "Not authenticated");
    const { supabase } = auth;

    const idParse = z.string().uuid().safeParse(transactionId);
    if (!idParse.success) {
      return err(ErrorCode.TransactionUpdateFailed, "Invalid transaction id");
    }

    const raw = Object.fromEntries(formData);
    const parsed = editTransactionSchema.safeParse(raw);

    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return err(
        ErrorCode.TransactionUpdateFailed,
        first?.message ?? "Invalid transaction data",
        String(first?.path[0] ?? ""),
      );
    }

    const amountMinor = Math.round(
      parseFloat(parsed.data.amount_display) * 100,
    );
    const subcategoryId =
      parsed.data.subcategory_id && parsed.data.subcategory_id !== ""
        ? parsed.data.subcategory_id
        : null;

    const { error: rpcError } = await supabase.rpc("rpc_edit_transaction", {
      p_transaction_id: transactionId,
      p_account_id: parsed.data.account_id,
      p_category_id: parsed.data.category_id,
      p_amount_minor: amountMinor,
      p_date: parsed.data.date,
      p_note: parsed.data.note ?? null,
      p_subcategory_id: subcategoryId,
    });

    if (rpcError) {
      const msg =
        rpcError.code === "P0001"
          ? rpcError.message
          : "Failed to update transaction. Please try again.";
      return err(ErrorCode.TransactionUpdateFailed, msg);
    }

    revalidatePath("/dashboard");
    revalidatePath("/transactions");
    revalidatePath("/transactions/" + transactionId);
    return ok();
  } catch {
    return err(
      ErrorCode.TransactionUpdateFailed,
      "An unexpected error occurred. Please try again.",
    );
  }
}

export async function deleteTransaction(
  transactionId: string,
): Promise<Result<void>> {
  try {
    const auth = await requireUser();
    if (!auth)
      return err(ErrorCode.TransactionDeleteFailed, "Not authenticated");
    const { supabase } = auth;

    const idParse = z.string().uuid().safeParse(transactionId);
    if (!idParse.success) {
      return err(ErrorCode.TransactionDeleteFailed, "Invalid transaction id");
    }

    const { error: rpcError } = await supabase.rpc("rpc_delete_transaction", {
      p_transaction_id: transactionId,
    });

    if (rpcError) {
      const msg =
        rpcError.code === "P0001"
          ? rpcError.message
          : "Failed to delete transaction. Please try again.";
      return err(ErrorCode.TransactionDeleteFailed, msg);
    }

    revalidatePath("/dashboard");
    revalidatePath("/transactions");
    return ok();
  } catch {
    return err(
      ErrorCode.TransactionDeleteFailed,
      "An unexpected error occurred. Please try again.",
    );
  }
}

export async function getActivityTrail(
  transactionId: string,
): Promise<ActivityTrailEntry[]> {
  try {
    if (!transactionId || !z.string().uuid().safeParse(transactionId).success)
      return [];
    const auth = await requireUser();
    if (!auth) return [];
    const { supabase, user } = auth;
    const { data } = await supabase
      .from("activity_trail")
      .select(
        "id, user_id, transaction_id, change_type, changed_fields, created_at",
      )
      .eq("transaction_id", transactionId)
      .eq("user_id", user.id) // explicit user_id filter (defense-in-depth §9)
      .order("created_at", { ascending: false });
    return (data ?? []) as ActivityTrailEntry[];
  } catch {
    return [];
  }
}
