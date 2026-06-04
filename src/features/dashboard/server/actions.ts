"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/require-user";
import { ErrorCode, err, ok, type Result } from "@/lib/errors";
import type { DashboardProfile } from "@/features/dashboard/checklist";

export async function getDashboardProfile(): Promise<Result<DashboardProfile>> {
  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.ProfileFetchFailed, "Not authenticated");
    const { supabase, user } = auth;

    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, display_name, checklist_completed_at")
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      return err(ErrorCode.ProfileFetchFailed, "Failed to load profile");
    }

    return ok(data as DashboardProfile);
  } catch {
    return err(
      ErrorCode.ProfileFetchFailed,
      "An unexpected error occurred. Please try again.",
    );
  }
}

export async function markChecklistComplete(): Promise<void> {
  try {
    const auth = await requireUser();
    if (!auth) return;
    const { supabase, user } = auth;

    const { error, count } = await supabase
      .from("profiles")
      .update(
        { checklist_completed_at: new Date().toISOString() },
        { count: "exact" },
      )
      .eq("user_id", user.id)
      .is("checklist_completed_at", null);

    if (error) return;
    if (!count || count === 0) return;

    const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (posthogKey) {
      const posthogHost =
        process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
      await fetch(`${posthogHost}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: posthogKey,
          event: "checklist_completed",
          distinct_id: user.id,
          properties: { user_id: user.id, surface: "dashboard" },
        }),
      }).catch(() => {
        // Analytics failure is non-fatal — never block the user path
      });
    }

    revalidatePath("/dashboard");
  } catch {
    // Dismiss is non-fatal — do not surface errors to the user
  }
}
