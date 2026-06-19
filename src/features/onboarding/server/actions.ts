"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/require-user";
import { ErrorCode, err, ok, type Result } from "@/lib/errors";
import {
  nameStepSchema,
  currencyStepSchema,
  type OnboardingProfile,
} from "@/features/onboarding/schema";
import {
  createAccount,
  updateAccount,
} from "@/features/accounts/server/actions";

export async function getOnboardingProfile(): Promise<
  Result<OnboardingProfile>
> {
  const auth = await requireUser();
  if (!auth) return err(ErrorCode.ProfileFetchFailed, "Not authenticated");
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "user_id, display_name, currency, onboarding_step, onboarding_completed_at",
    )
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return err(ErrorCode.ProfileFetchFailed, "Failed to load profile");
  }

  return ok(data as OnboardingProfile);
}

export async function saveNameStep(formData: FormData): Promise<void> {
  const raw = { display_name: formData.get("display_name") };
  const parsed = nameStepSchema.safeParse(raw);
  if (!parsed.success) return;

  const auth = await requireUser();
  if (!auth) return;
  const { supabase, user } = auth;

  // Guard: only advance if still on step 1
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.display_name, onboarding_step: 2 })
    .eq("user_id", user.id)
    .lte("onboarding_step", 1);

  if (error) return;
  redirect("/onboarding/currency");
}

export async function saveCurrencyStep(formData: FormData): Promise<void> {
  const raw = { currency: formData.get("currency") };
  const parsed = currencyStepSchema.safeParse(raw);
  if (!parsed.success) return;

  const auth = await requireUser();
  if (!auth) return;
  const { supabase, user } = auth;

  // Guard: only advance if still on step 2 (prevents backward step reset via deep-link)
  const { error } = await supabase
    .from("profiles")
    .update({ currency: parsed.data.currency, onboarding_step: 3 })
    .eq("user_id", user.id)
    .lte("onboarding_step", 2);

  if (error) return;
  redirect("/onboarding/account");
}

export async function createFirstAccountAndAdvance(
  formData: FormData,
): Promise<void> {
  const auth = await requireUser();
  if (!auth) return;
  const { supabase, user } = auth;

  // Idempotency for step-back: if the user already created an account in a
  // prior visit to this step, update it in place instead of inserting a
  // duplicate. Otherwise create a fresh one.
  const { data: existing } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const result = await updateAccount(existing.id, formData);
    if (!result.ok) return;
  } else {
    const result = await createAccount(formData);
    if (!result.ok) return;
  }

  // Guard: only advance if still on step 3 (no-op when already past it)
  await supabase
    .from("profiles")
    .update({ onboarding_step: 4 })
    .eq("user_id", user.id)
    .lte("onboarding_step", 3);

  redirect("/onboarding/categories");
}

export async function completeOnboarding(): Promise<void> {
  const auth = await requireUser();
  if (!auth) return;
  const { supabase, user } = auth;

  // Guard: only complete if still on step 4 (idempotency — prevents double-submit)
  const { error } = await supabase
    .from("profiles")
    .update({
      onboarding_step: 5,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .lte("onboarding_step", 4);

  if (error) return;
  redirect("/onboarding/complete");
}
