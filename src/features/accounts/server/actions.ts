"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/require-user";
import { ErrorCode, err, ok, type Result } from "@/lib/errors";
import {
  createAccountSchema,
  updateAccountSchema,
  internalTransferSchema,
  externalTransferSchema,
  type Account,
} from "@/features/accounts/schema";

export async function createAccount(
  formData: FormData,
): Promise<Result<Account>> {
  const raw = Object.fromEntries(formData);
  const parsed = createAccountSchema.safeParse(raw);

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return err(
      ErrorCode.AccountCreateFailed,
      first?.message ?? "Invalid account data",
      String(first?.path[0] ?? ""),
    );
  }

  const openingBalanceMinor = Math.round(
    parseFloat(parsed.data.openingBalance) * 100,
  );

  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.AccountCreateFailed, "Not authenticated");
    const { supabase, user } = auth;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("currency")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return err(
        ErrorCode.AccountCreateFailed,
        "Failed to load currency setting. Please try again.",
      );
    }

    const { data, error } = await supabase
      .from("accounts")
      .insert({
        user_id: user.id,
        name: parsed.data.name,
        type: parsed.data.type,
        actual_balance_minor: openingBalanceMinor,
        currency: profile.currency,
      })
      .select()
      .single();

    if (error || !data) {
      return err(
        ErrorCode.AccountCreateFailed,
        "Failed to create account. Please try again.",
      );
    }

    revalidatePath("/settings/accounts");
    return ok(data as Account);
  } catch {
    return err(
      ErrorCode.AccountCreateFailed,
      "An unexpected error occurred. Please try again.",
    );
  }
}

export async function getAccounts(): Promise<Result<Account[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .is("archived_at", null)
      .order("created_at", { ascending: true });

    if (error) {
      return err(ErrorCode.AccountFetchFailed, "Failed to load accounts.");
    }

    return ok((data ?? []) as Account[]);
  } catch {
    return err(ErrorCode.AccountFetchFailed, "Failed to load accounts.");
  }
}

export async function updateAccount(
  id: string,
  formData: FormData,
): Promise<Result<Account>> {
  const raw = Object.fromEntries(formData);
  const parsed = updateAccountSchema.safeParse(raw);

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return err(
      ErrorCode.AccountUpdateFailed,
      first?.message ?? "Invalid data",
      String(first?.path[0] ?? ""),
    );
  }

  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.AccountUpdateFailed, "Not authenticated");
    const { supabase } = auth;

    const { data, error } = await supabase
      .from("accounts")
      .update({ name: parsed.data.name, type: parsed.data.type })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      return err(
        ErrorCode.AccountUpdateFailed,
        "Failed to update account. Please try again.",
      );
    }

    revalidatePath("/settings/accounts");
    return ok(data as Account);
  } catch {
    return err(ErrorCode.AccountUpdateFailed, "An unexpected error occurred.");
  }
}

export async function archiveAccount(id: string): Promise<Result<void>> {
  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.AccountArchiveFailed, "Not authenticated");
    const { supabase } = auth;

    const { error } = await supabase
      .from("accounts")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      return err(
        ErrorCode.AccountArchiveFailed,
        "Failed to archive account. Please try again.",
      );
    }

    revalidatePath("/settings/accounts");
    revalidatePath("/transactions/new");
    return ok();
  } catch {
    return err(ErrorCode.AccountArchiveFailed, "An unexpected error occurred.");
  }
}

export async function unarchiveAccount(id: string): Promise<Result<void>> {
  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.AccountArchiveFailed, "Not authenticated");
    const { supabase } = auth;

    const { error } = await supabase
      .from("accounts")
      .update({ archived_at: null })
      .eq("id", id);

    if (error) {
      return err(
        ErrorCode.AccountArchiveFailed,
        "Failed to unarchive account. Please try again.",
      );
    }

    revalidatePath("/settings/accounts");
    revalidatePath("/transactions/new");
    return ok();
  } catch {
    return err(ErrorCode.AccountArchiveFailed, "An unexpected error occurred.");
  }
}

export async function deleteAccount(id: string): Promise<Result<void>> {
  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.AccountDeleteFailed, "Not authenticated");
    const { supabase } = auth;

    const { error } = await supabase.rpc("rpc_delete_account", {
      p_account_id: id,
    });

    if (error) {
      const msg = error.message?.includes("transaction history")
        ? "Cannot delete — this account has transaction history. Archive it instead."
        : "Failed to delete account. Please try again.";
      return err(ErrorCode.AccountDeleteFailed, msg);
    }

    revalidatePath("/settings/accounts");
    revalidatePath("/transactions/new");
    return ok();
  } catch {
    return err(ErrorCode.AccountDeleteFailed, "An unexpected error occurred.");
  }
}

export async function createInternalTransfer(
  formData: FormData,
): Promise<Result<void>> {
  const raw = Object.fromEntries(formData);
  const parsed = internalTransferSchema.safeParse(raw);

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return err(
      ErrorCode.TransferCreateFailed,
      first?.message ?? "Invalid transfer data",
      String(first?.path[0] ?? ""),
    );
  }

  const amountMinor = Math.round(parseFloat(parsed.data.amount) * 100);

  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.TransferCreateFailed, "Not authenticated");
    const { supabase } = auth;

    const { error } = await supabase.rpc("rpc_internal_transfer", {
      p_from_account_id: parsed.data.from_account_id,
      p_to_account_id: parsed.data.to_account_id,
      p_amount_minor: amountMinor,
      p_date: parsed.data.date,
      p_note: parsed.data.note || null,
    });

    if (error) {
      const msg = error.message?.includes("same")
        ? "Source and destination accounts must be different."
        : error.message?.includes("not found") ||
            error.message?.includes("archived")
          ? "One or both accounts could not be found. Please refresh and try again."
          : "Failed to record transfer. Please try again.";
      return err(ErrorCode.TransferCreateFailed, msg);
    }

    revalidatePath("/settings/accounts");
    return ok();
  } catch {
    return err(
      ErrorCode.TransferCreateFailed,
      "An unexpected error occurred. Please try again.",
    );
  }
}

export async function createExternalTransfer(
  formData: FormData,
): Promise<Result<void>> {
  const raw = Object.fromEntries(formData);
  const parsed = externalTransferSchema.safeParse(raw);

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return err(
      ErrorCode.TransferCreateFailed,
      first?.message ?? "Invalid transfer data",
      String(first?.path[0] ?? ""),
    );
  }

  const amountMinor = Math.round(parseFloat(parsed.data.amount) * 100);

  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.TransferCreateFailed, "Not authenticated");
    const { supabase } = auth;

    const { error } = await supabase.rpc("rpc_external_transfer", {
      p_account_id: parsed.data.account_id,
      p_direction: parsed.data.direction,
      p_amount_minor: amountMinor,
      p_date: parsed.data.date,
      p_note: parsed.data.note || null,
    });

    if (error) {
      const msg =
        error.message?.includes("not found") ||
        error.message?.includes("archived")
          ? "Account could not be found. Please refresh and try again."
          : "Failed to record transfer. Please try again.";
      return err(ErrorCode.TransferCreateFailed, msg);
    }

    revalidatePath("/settings/accounts");
    return ok();
  } catch {
    return err(
      ErrorCode.TransferCreateFailed,
      "An unexpected error occurred. Please try again.",
    );
  }
}
