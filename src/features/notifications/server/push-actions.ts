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
    // ignoreDuplicates: false — browsers periodically rotate p256dh/auth for
    // the same endpoint; re-subscribing must overwrite the stale keys, not
    // silently keep them (a kept-stale row would fail every push send).
    { onConflict: "user_id,endpoint", ignoreDuplicates: false },
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
