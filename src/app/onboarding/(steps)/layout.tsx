import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingStepsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return redirect("/auth/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("user_id", user.id)
    .single();

  // PGRST116 = no row yet (profile trigger still committing) — let the step pages handle it
  if (!profileError && profile?.onboarding_completed_at) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
