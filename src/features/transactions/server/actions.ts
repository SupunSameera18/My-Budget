"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/require-user";
import { ErrorCode, err, ok, type Result } from "@/lib/errors";
import {
  logTransactionSchema,
  editTransactionSchema,
  editSharedTransactionSchema,
  type TransactionFormData,
  type TransactionDefaults,
  type EditTransactionFormData,
  type ActivityTrailEntry,
  type TransactionListFilters,
  type TransactionListData,
  type TransactionListItem,
} from "@/features/transactions/schema";
import { z } from "zod";
import { getAccounts } from "@/features/accounts/server/actions";
import { currentMonthBoundaries } from "@/lib/period";
import { dedupeRecentNotes } from "@/lib/note-suggestions";
import type { MacroWithTarget } from "@/features/macros/schema";
import { splitTransaction as computeSplit } from "@/lib/money/split";

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

    const macrosResult = await supabase
      .from("macros")
      .select(
        "id, name, amount_minor, last_used_at, created_at, account_id, goal_id, category_id, accounts(name), goals(name), categories(name)",
      )
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: true });

    const macros: MacroWithTarget[] = (macrosResult.data ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      amount_minor: m.amount_minor,
      last_used_at: m.last_used_at,
      archived_at: null,
      created_at: m.created_at,
      user_id: user.id,
      account_id: m.account_id,
      goal_id: m.goal_id,
      category_id: m.category_id,
      account_name:
        (m.accounts as unknown as { name: string } | null)?.name ?? null,
      goal_name: (m.goals as unknown as { name: string } | null)?.name ?? null,
      category_name:
        (m.categories as unknown as { name: string } | null)?.name ?? "",
    }));

    // Fetch family status + transaction defaults in parallel (non-fatal — fallback to solo/null if error)
    const [{ data: membership }, { data: txDefaultsProfile }] =
      await Promise.all([
        supabase
          .from("family_members")
          .select("family_unit_id")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("transaction_defaults")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
    const isFamilyMode = !!membership;
    const transactionDefaults =
      (txDefaultsProfile?.transaction_defaults as TransactionDefaults | null) ??
      null;

    return ok({
      accounts,
      categories: (categories ?? []) as TransactionFormData["categories"],
      currency,
      defaultAccountId,
      subcategoriesEnabled,
      subcategories: subcategories as TransactionFormData["subcategories"],
      currentBreathingRoomMinor,
      macros,
      transactionDefaults,
      isFamilyMode,
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

  const isShared = parsed.data.is_shared === "true";

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

    const { data: newTxId, error: rpcError } = await supabase.rpc(
      "rpc_log_transaction",
      {
        p_account_id: parsed.data.account_id,
        p_category_id: parsed.data.category_id,
        p_amount_minor: amountMinor,
        p_date: parsed.data.date,
        p_note: parsed.data.note ?? null,
        p_subcategory_id: subcategoryId,
        p_is_shared: isShared,
      },
    );

    if (rpcError) {
      return err(
        ErrorCode.TransactionCreateFailed,
        "Failed to log transaction. Please try again.",
      );
    }

    // Auto-split Shared transactions with equal split (non-fatal — tx is already logged)
    if (isShared && newTxId) {
      try {
        const split = computeSplit({ amountMinor, method: "equal" });
        await supabase
          .rpc("rpc_split_transaction", {
            p_transaction_id: newTxId,
            p_split_method: "equal",
            p_payer_id: user.id,
            p_payer_share_minor: split.payerShareMinor,
            p_partner_share_minor: split.partnerShareMinor,
          })
          .throwOnError();
      } catch (splitErr) {
        // Non-fatal: transaction already logged; user can re-split from edit sheet
        console.error("[logTransaction] auto-split failed:", splitErr);
      }

      // Non-fatal: notify partner about new shared transaction. Fire-and-forget —
      // never await or check the result, a notification failure must never
      // degrade the transaction-logging flow.
      supabase
        .rpc("rpc_notify_partner_shared_transaction", {
          p_transaction_id: newTxId,
        })
        .then(
          () => {},
          (notifyErr) => {
            console.error(
              "[logTransaction] partner notification failed:",
              notifyErr,
            );
          },
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
        "id, user_id, account_id, category_id, subcategory_id, amount_minor, date, note, type, is_shared, created_at, updated_at, archived_at",
      )
      .eq("id", id)
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

    // For Shared transactions where the viewer is not the owner, fetch the owner's
    // categories via SECURITY DEFINER RPC (partner's RLS would otherwise filter them out)
    const isViewerOwner = transaction.user_id === user.id;
    let categories: { id: string; name: string; type: string }[] | null = null;
    let catError: { message: string } | null = null;

    // When the partner's category_id (from the transaction) is archived and absent from
    // the owner's active category list, clear it so the UI forces picking a valid one
    // rather than silently submitting a stale UUID that the RPC will reject with 23514.
    let partnerCategoryIdOverride: string | null = null;

    if (transaction.is_shared && !isViewerOwner) {
      const { data: ownerCats, error: ownerCatError } = await supabase.rpc(
        "rpc_get_transaction_owner_categories",
        { p_transaction_id: id },
      );
      if (ownerCatError) {
        catError = ownerCatError;
      } else {
        const mappedCats = (ownerCats ?? []).map(
          (c: { cat_id: string; name: string; type: string }) => ({
            id: c.cat_id,
            name: c.name,
            type: c.type,
          }),
        );
        categories = mappedCats;
        const activeCatIds = new Set(
          mappedCats.map((c: { id: string }) => c.id),
        );
        if (
          transaction.category_id &&
          !activeCatIds.has(transaction.category_id)
        ) {
          partnerCategoryIdOverride = "";
        }
      }
    } else {
      const { data: myCats, error: myCatError } = await supabase
        .from("categories")
        .select("id, name, type")
        .is("archived_at", null)
        .order("type", { ascending: true })
        .order("name", { ascending: true });
      catError = myCatError;
      categories = myCats;
    }

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
    // Non-owner partner cannot see or pick owner's subcategories (no RPC equivalent).
    // Disable subcategory UI for the partner — existing subcategory_id is preserved server-side
    // since buildSharedFormData does not include it.
    if (subcategoriesEnabled && isViewerOwner) {
      const { data: subcatsData } = await supabase
        .from("subcategories")
        .select("id, name, category_id")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("created_at", { ascending: true });
      subcategories = subcatsData ?? [];
    }

    // Non-fatally fetch family status: partner name + partner join_date for reclassify UI
    let partnerName: string | undefined;
    let isFamilyMode = false;
    let partnerJoinDate: string | null = null;
    try {
      const [{ data: familyStatus }, { data: partnerRow }] = await Promise.all([
        supabase.rpc("rpc_get_family_status"),
        supabase
          .from("family_members")
          .select("family_unit_id")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      const raw = familyStatus as Record<string, unknown>;
      if (raw?.status === "in_family") {
        isFamilyMode = true;
        if (typeof raw?.partner_name === "string") {
          partnerName = raw.partner_name;
        }
        // Fetch partner join_date (needed for pre-join block UI)
        if (partnerRow?.family_unit_id) {
          const { data: partnerMember } = await supabase
            .from("family_members")
            .select("join_date")
            .eq("family_unit_id", partnerRow.family_unit_id)
            .neq("user_id", user.id)
            .maybeSingle();
          partnerJoinDate = partnerMember?.join_date ?? null;
        }
      }
    } catch {
      // Non-fatal — reclassify controls will be hidden in solo mode
    }

    const effectiveTransaction =
      partnerCategoryIdOverride !== null
        ? {
            ...transaction,
            category_id: partnerCategoryIdOverride,
          }
        : transaction;

    return ok({
      transaction:
        effectiveTransaction as EditTransactionFormData["transaction"],
      accounts: accountsResult.data,
      categories: (categories ?? []) as EditTransactionFormData["categories"],
      currency,
      subcategoriesEnabled,
      subcategories: subcategories as EditTransactionFormData["subcategories"],
      partnerName,
      viewerUserId: user.id,
      isFamilyMode,
      partnerJoinDate,
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

export async function getTransactionList(
  filters: TransactionListFilters = {},
): Promise<Result<TransactionListData>> {
  try {
    const auth = await requireUser();
    if (!auth)
      return err(ErrorCode.TransactionFetchFailed, "Not authenticated");
    const { supabase, user } = auth;

    // Validate filter params — invalid values silently fall back to no-filter
    const validAccountId = z.string().uuid().safeParse(filters.account_id)
      .success
      ? filters.account_id
      : undefined;
    const validCategoryId = z.string().uuid().safeParse(filters.category_id)
      .success
      ? filters.category_id
      : undefined;
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const validFrom = datePattern.test(filters.from ?? "")
      ? filters.from
      : undefined;
    const validTo = datePattern.test(filters.to ?? "") ? filters.to : undefined;

    // Build transaction query
    // In family mode: omit user_id filter so RLS predicate (7.1b) handles cross-user visibility.
    // In single-user mode: keep user_id filter for performance (narrower index scan).
    let txnQuery = supabase
      .from("transactions")
      .select(
        "id, account_id, category_id, amount_minor, date, note, type, is_shared, created_at, accounts ( name ), categories ( name, type )",
      )
      .is("archived_at", null) // active only
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);

    if (!filters.isFamilyMode) {
      txnQuery = txnQuery.eq("user_id", user.id);
    } else {
      // In family mode, apply scope filter on top of RLS
      const scope = filters.scope ?? "combined";
      if (scope === "personal") {
        txnQuery = txnQuery.eq("is_shared", false).eq("user_id", user.id);
      } else if (scope === "shared") {
        txnQuery = txnQuery.eq("is_shared", true);
      }
      // combined: RLS handles everything, no additional filter
    }

    if (validAccountId) txnQuery = txnQuery.eq("account_id", validAccountId);
    if (validCategoryId) txnQuery = txnQuery.eq("category_id", validCategoryId);
    if (validFrom) txnQuery = txnQuery.gte("date", validFrom);
    if (validTo) txnQuery = txnQuery.lte("date", validTo);

    const { data: txnData, error: txnError } = await txnQuery;
    if (txnError) {
      return err(
        ErrorCode.TransactionFetchFailed,
        "Failed to load transactions",
      );
    }

    const items: TransactionListItem[] = (txnData ?? []).map((row) => ({
      id: row.id,
      account_id: row.account_id,
      category_id: row.category_id,
      amount_minor: row.amount_minor,
      date: row.date,
      note: row.note,
      type: row.type as "income" | "expense",
      is_shared: row.is_shared ?? false,
      created_at: row.created_at,
      account_name:
        (row.accounts as unknown as { name: string } | null)?.name ?? "Unknown",
      category_name:
        (row.categories as unknown as { name: string; type: string } | null)
          ?.name ?? "Unknown",
    }));

    // Accounts for filter dropdown
    let accountsQuery = supabase
      .from("accounts")
      .select("id, name, archived_at")
      .eq("user_id", user.id)
      .order("name");
    if (!filters.showArchivedAccounts) {
      accountsQuery = accountsQuery.is("archived_at", null);
    }
    const { data: accountsData, error: accountsError } = await accountsQuery;
    if (accountsError)
      console.error(
        "[getTransactionList] accounts query failed:",
        accountsError.message,
      );

    // Categories for filter dropdown
    let catsQuery = supabase
      .from("categories")
      .select("id, name, type, archived_at")
      .eq("user_id", user.id)
      .order("type")
      .order("name");
    if (!filters.showArchivedCategories) {
      catsQuery = catsQuery.is("archived_at", null);
    }
    const { data: catsData, error: catsError } = await catsQuery;
    if (catsError)
      console.error(
        "[getTransactionList] categories query failed:",
        catsError.message,
      );

    // Profile for currency
    const { data: profile } = await supabase
      .from("profiles")
      .select("currency")
      .eq("user_id", user.id)
      .single();

    return ok({
      items,
      accounts: (accountsData ?? []) as TransactionListData["accounts"],
      categories: (catsData ?? []) as TransactionListData["categories"],
      currency: profile?.currency ?? "USD",
      familyUnitId: filters.familyUnitId,
    });
  } catch {
    return err(
      ErrorCode.TransactionFetchFailed,
      "An unexpected error occurred. Please try again.",
    );
  }
}

export async function saveTransactionDefaults(
  defaults: TransactionDefaults,
): Promise<Result<void>> {
  try {
    const auth = await requireUser(); // requireUser FIRST (§9)
    if (!auth)
      return err(ErrorCode.TransactionDefaultsSaveFailed, "Not authenticated");
    const { supabase, user } = auth;

    const { error } = await supabase
      .from("profiles")
      .update({ transaction_defaults: defaults })
      .eq("user_id", user.id); // explicit user_id filter (§9 defense-in-depth)

    if (error)
      return err(
        ErrorCode.TransactionDefaultsSaveFailed,
        "Failed to save transaction defaults",
      );
    return ok(undefined);
  } catch {
    return err(
      ErrorCode.TransactionDefaultsSaveFailed,
      "An unexpected error occurred. Please try again.",
    );
  }
}

export async function splitTransactionAction(
  transactionId: string,
  splitMethod: "equal" | "percentage" | "fixed",
  payerShareMinor: number,
  partnerShareMinor: number,
): Promise<Result<void>> {
  try {
    const auth = await requireUser(); // requireUser FIRST (§9)
    if (!auth)
      return err(ErrorCode.SplitTransactionFailed, "Not authenticated");
    const { supabase, user } = auth;

    const idParse = z.string().uuid().safeParse(transactionId);
    if (!idParse.success) {
      return err(ErrorCode.SplitTransactionFailed, "Invalid transaction id");
    }

    if (payerShareMinor < 0 || partnerShareMinor < 0) {
      return err(
        ErrorCode.SplitTransactionFailed,
        "Share amounts must be non-negative",
      );
    }

    const { error } = await supabase.rpc("rpc_split_transaction", {
      p_transaction_id: transactionId,
      p_split_method: splitMethod,
      p_payer_id: user.id,
      p_payer_share_minor: payerShareMinor,
      p_partner_share_minor: partnerShareMinor,
    });

    if (error) {
      if (error.code === "P0001")
        return err(
          ErrorCode.SplitTransactionFailed,
          "Cannot split a personal transaction",
        );
      if (error.code === "23514")
        return err(
          ErrorCode.SplitTransactionFailed,
          "Split amounts do not add up to the transaction total",
        );
      if (error.code === "42501")
        return err(
          ErrorCode.SplitTransactionFailed,
          "You do not have access to split this transaction",
        );
      return err(ErrorCode.SplitTransactionFailed, "Failed to save split");
    }

    revalidatePath("/transactions");
    revalidatePath("/transactions/" + transactionId);
    return ok();
  } catch {
    return err(
      ErrorCode.SplitTransactionFailed,
      "An unexpected error occurred. Please try again.",
    );
  }
}

// rpc_reclassify_transaction (migration 0046) handles partner notification cleanup
// for Shared→Personal: deletes if push_notified_at IS NULL, dismisses if push delivered.
export async function reclassifyTransaction(
  transactionId: string,
  newIsShared: boolean,
): Promise<Result<void>> {
  try {
    const auth = await requireUser(); // requireUser FIRST (§9)
    if (!auth)
      return err(ErrorCode.ReclassifyTransactionFailed, "Not authenticated");
    const { supabase } = auth;

    const idParse = z.string().uuid().safeParse(transactionId);
    if (!idParse.success) {
      return err(
        ErrorCode.ReclassifyTransactionFailed,
        "Invalid transaction id",
      );
    }

    const { error: rpcError } = await supabase.rpc(
      "rpc_reclassify_transaction",
      {
        p_transaction_id: idParse.data,
        p_new_is_shared: newIsShared,
      },
    );

    if (rpcError) {
      const code = rpcError.code;
      if (code === "P0001") {
        return err(
          ErrorCode.ReclassifyTransactionFailed,
          "Transaction is already that type.",
        );
      }
      if (code === "P0002") {
        return err(
          ErrorCode.ReclassifyTransactionFailed,
          "Transaction not found.",
        );
      }
      if (code === "P0003") {
        return err(
          ErrorCode.ReclassifyTransactionFailed,
          "This transaction predates your partner's join date and cannot be shared.",
        );
      }
      if (code === "P0004") {
        return err(
          ErrorCode.ReclassifyTransactionFailed,
          "This transaction is in a settled period. Use a correction entry instead.",
        );
      }
      if (code === "42501") {
        return err(
          ErrorCode.ReclassifyTransactionFailed,
          "You don't have permission to reclassify this transaction.",
        );
      }
      return err(
        ErrorCode.ReclassifyTransactionFailed,
        "Failed to reclassify transaction. Please try again.",
      );
    }

    revalidatePath("/dashboard");
    revalidatePath("/transactions");
    revalidatePath("/transactions/" + transactionId);
    return ok();
  } catch {
    return err(
      ErrorCode.ReclassifyTransactionFailed,
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
    const { supabase } = auth;
    // RLS policy "activity trail visibility" (0024) shows own entries + partner entries
    // for Shared transactions — no explicit user_id filter needed here.
    const { data } = await supabase
      .from("activity_trail")
      .select(
        "id, user_id, transaction_id, change_type, changed_fields, created_at",
      )
      .eq("transaction_id", transactionId)
      .order("created_at", { ascending: false });
    return (data ?? []) as ActivityTrailEntry[];
  } catch {
    return [];
  }
}

export async function editSharedTransaction(
  transactionId: string,
  formData: FormData,
): Promise<Result<void>> {
  try {
    const auth = await requireUser(); // requireUser FIRST (§9)
    if (!auth)
      return err(ErrorCode.SharedTransactionEditFailed, "Not authenticated");
    const { supabase } = auth;

    const idParse = z.string().uuid().safeParse(transactionId);
    if (!idParse.success) {
      return err(
        ErrorCode.SharedTransactionEditFailed,
        "Invalid transaction id",
      );
    }

    const raw = Object.fromEntries(formData);
    const parsed = editSharedTransactionSchema.safeParse(raw);

    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return err(
        ErrorCode.SharedTransactionEditFailed,
        first?.message ?? "Invalid transaction data",
        String(first?.path[0] ?? ""),
      );
    }

    const { error: rpcError } = await supabase.rpc(
      "rpc_edit_shared_transaction",
      {
        p_transaction_id: transactionId,
        p_note: parsed.data.note ?? null,
        p_category_id: parsed.data.category_id,
      },
    );

    if (rpcError) {
      const code = rpcError.code;
      if (code === "P0001") {
        return err(
          ErrorCode.SharedTransactionEditFailed,
          "This is a personal transaction. Use the standard edit flow.",
        );
      }
      if (code === "P0002") {
        return err(
          ErrorCode.SharedTransactionEditFailed,
          "Transaction not found.",
        );
      }
      if (code === "42501") {
        return err(
          ErrorCode.SharedTransactionEditFailed,
          "You do not have permission to edit this transaction.",
        );
      }
      if (code === "23514") {
        return err(
          ErrorCode.SharedTransactionEditFailed,
          "The selected category does not belong to the transaction owner.",
        );
      }
      return err(
        ErrorCode.SharedTransactionEditFailed,
        "Failed to update transaction. Please try again.",
      );
    }

    revalidatePath("/dashboard");
    revalidatePath("/transactions");
    revalidatePath("/transactions/" + transactionId);
    return ok();
  } catch {
    return err(
      ErrorCode.SharedTransactionEditFailed,
      "An unexpected error occurred. Please try again.",
    );
  }
}
