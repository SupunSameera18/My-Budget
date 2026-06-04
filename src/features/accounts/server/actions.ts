"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/require-user";
import { ErrorCode, err, ok, type Result } from "@/lib/errors";
import { createAccountSchema, type Account } from "@/features/accounts/schema";

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
