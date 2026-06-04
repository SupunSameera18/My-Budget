import { redirect } from "next/navigation";
import { getOnboardingProfile } from "@/features/onboarding/server/actions";

export default async function OnboardingPage() {
  const result = await getOnboardingProfile();
  if (!result.ok) redirect("/auth/login");

  const { onboarding_step, onboarding_completed_at } = result.data;

  // Already completed — go straight to dashboard (breaks potential redirect loop)
  if (onboarding_completed_at) redirect("/dashboard");

  if (onboarding_step <= 1) redirect("/onboarding/name");
  if (onboarding_step === 2) redirect("/onboarding/currency");
  if (onboarding_step === 3) redirect("/onboarding/account");
  if (onboarding_step === 4) redirect("/onboarding/categories");

  // step=5 but onboarding_completed_at is null (stale state) — re-trigger final step
  redirect("/onboarding/categories");
}
