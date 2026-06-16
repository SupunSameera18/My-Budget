"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/require-user";
import { ok, err, ErrorCode } from "@/lib/errors";
import type { Result } from "@/lib/errors";
import type { PushSubscriptionJSON } from "@/features/notifications/schema";

export async function subscribePush(
  subscription: PushSubscriptionJSON,
): Promise<Result<void>> {
  const auth = await requireUser();
  if (!auth) return redirect("/auth/login") as never;

  const { error } = await auth.supabase.from("push_subscriptions").upsert(
    {
      user_id: auth.user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: "user_id,endpoint", ignoreDuplicates: true },
  );

  if (error) return err(ErrorCode.PushSubscribeFailed, error.message);
  return ok(undefined);
}

export async function unsubscribePush(endpoint: string): Promise<Result<void>> {
  const auth = await requireUser();
  if (!auth) return redirect("/auth/login") as never;

  const { error } = await auth.supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", auth.user.id)
    .eq("endpoint", endpoint);

  if (error) return err(ErrorCode.PushUnsubscribeFailed, error.message);
  return ok(undefined);
}

// Graceful supplementary — returns 0 on any error so the toggle UI never breaks.
export async function getPushSubscriptionCount(): Promise<number> {
  try {
    const auth = await requireUser();
    if (!auth) return 0;

    const { count, error } = await auth.supabase
      .from("push_subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", auth.user.id);

    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
