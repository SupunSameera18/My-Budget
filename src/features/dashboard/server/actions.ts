"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ErrorCode, err, ok, type Result } from "@/lib/errors";
import type { DashboardProfile } from "@/features/dashboard/checklist";

export async function getDashboardProfile(): Promise<Result<DashboardProfile>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return err(ErrorCode.ProfileFetchFailed, "Not authenticated");

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, display_name, checklist_completed_at")
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return err(ErrorCode.ProfileFetchFailed, "Failed to load profile");
  }

  return ok(data as DashboardProfile);
}

export async function markChecklistComplete(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Atomic idempotency: the IS NULL guard in the WHERE clause prevents double-writes
  // under concurrent calls. count=exact reports how many rows were actually changed,
  // allowing us to fire PostHog only on the first (real) completion.
  const { error, count } = await supabase
    .from("profiles")
    .update(
      { checklist_completed_at: new Date().toISOString() },
      { count: "exact" },
    )
    .eq("user_id", user.id)
    .is("checklist_completed_at", null);

  if (error) return; // DB write failed — do not fire analytics or revalidate
  if (!count || count === 0) return; // Already completed — idempotent, skip PostHog

  // Fire checklist_completed event via PostHog HTTP API (no posthog-node installed).
  // posthog.ts is "use client" only; server actions use the capture REST endpoint.
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
}
