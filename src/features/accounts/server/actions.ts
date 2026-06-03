"use server";

import { createClient } from "@/lib/supabase/server";
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

  // Convert decimal string to integer minor units (2 decimal places for all supported currencies in v1)
  const openingBalanceMinor = Math.round(
    parseFloat(parsed.data.openingBalance) * 100,
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err(ErrorCode.AccountCreateFailed, "Not authenticated");
  }

  // Fetch currency from profile (set during onboarding step 1)
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

  const currency = profile.currency;

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      type: parsed.data.type,
      actual_balance_minor: openingBalanceMinor,
      currency,
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
}

export async function getAccounts(): Promise<Result<Account[]>> {
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
}
