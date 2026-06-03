"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ErrorCode, err, ok, type Result } from "@/lib/errors";
import {
  currencyStepSchema,
  type OnboardingProfile,
} from "@/features/onboarding/schema";
import { createAccount } from "@/features/accounts/server/actions";

export async function getOnboardingProfile(): Promise<
  Result<OnboardingProfile>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err(ErrorCode.ProfileFetchFailed, "Not authenticated");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, currency, onboarding_step, onboarding_completed_at")
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return err(ErrorCode.ProfileFetchFailed, "Failed to load profile");
  }

  return ok(data as OnboardingProfile);
}

export async function saveCurrencyStep(formData: FormData): Promise<void> {
  const raw = { currency: formData.get("currency") };
  const parsed = currencyStepSchema.safeParse(raw);
  if (!parsed.success) return; // <select> contains only valid codes; invalid input is a bypass

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Guard: only advance if still on step 1 (prevents backward step reset via deep-link)
  const { error } = await supabase
    .from("profiles")
    .update({ currency: parsed.data.currency, onboarding_step: 2 })
    .eq("user_id", user.id)
    .lte("onboarding_step", 1);

  if (error) return; // DB failure — don't advance
  redirect("/onboarding/account");
}

export async function createFirstAccountAndAdvance(
  formData: FormData,
): Promise<void> {
  const result = await createAccount(formData);
  if (!result.ok) return; // Validation failed: stay on page (thin seam — no inline error display)

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Guard: only advance if still on step 2 (prevents double-submit step regression)
  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_step: 3 })
    .eq("user_id", user.id)
    .lte("onboarding_step", 2);

  if (error) return; // DB failure — don't advance
  redirect("/onboarding/categories");
}

export async function completeOnboarding(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Guard: only complete if still on step 3 (idempotency — prevents double-submit)
  const { error } = await supabase
    .from("profiles")
    .update({
      onboarding_step: 4,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .lte("onboarding_step", 3);

  if (error) return; // DB failure — don't redirect
  redirect("/onboarding/complete");
}
