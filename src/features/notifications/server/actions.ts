"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/require-user";
import { ok, err, ErrorCode } from "@/lib/errors";
import type { Result } from "@/lib/errors";
import type { Notification } from "@/features/notifications/schema";

const NOTIFICATIONS_PAGE_SIZE = 50;

export interface NotificationsPage {
  notifications: Notification[];
  /** True when more non-dismissed notifications exist beyond this page. */
  hasMore: boolean;
}

export async function getNotifications(): Promise<Result<NotificationsPage>> {
  const auth = await requireUser();
  if (!auth) return redirect("/auth/login") as never;

  // Fetch one extra row to detect truncation without a separate COUNT query —
  // a flat cap with no signal silently hid older notifications (Phase 2 gap
  // analysis, 9-1).
  const { data, error } = await auth.supabase
    .from("notifications")
    .select(
      "id, type, title, body, link, metadata, read_at, dismissed_at, created_at",
    )
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(NOTIFICATIONS_PAGE_SIZE + 1);

  if (error) return err(ErrorCode.NotificationsFetchFailed, error.message);

  const rows = (data ?? []) as Notification[];
  const hasMore = rows.length > NOTIFICATIONS_PAGE_SIZE;
  return ok({
    notifications: hasMore ? rows.slice(0, NOTIFICATIONS_PAGE_SIZE) : rows,
    hasMore,
  });
}

const idSchema = z.string().uuid();

export async function markNotificationRead(id: string): Promise<Result<void>> {
  const auth = await requireUser();
  if (!auth) return redirect("/auth/login") as never;

  const parsed = idSchema.safeParse(id);
  if (!parsed.success)
    return err(ErrorCode.NotificationUpdateFailed, "Invalid notification id");

  const { data, error } = await auth.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("user_id", auth.user.id)
    .is("read_at", null)
    .select("id");

  if (error) return err(ErrorCode.NotificationUpdateFailed, error.message);
  if (!data || data.length === 0)
    return err(
      ErrorCode.NotificationUpdateFailed,
      "Notification not found or already read",
    );
  return ok(undefined);
}

export async function markAllNotificationsRead(): Promise<Result<void>> {
  const auth = await requireUser();
  if (!auth) return redirect("/auth/login") as never;

  const { error } = await auth.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", auth.user.id)
    .is("read_at", null)
    .is("dismissed_at", null);

  if (error) return err(ErrorCode.NotificationUpdateFailed, error.message);
  return ok(undefined);
}

export async function dismissNotification(id: string): Promise<Result<void>> {
  const auth = await requireUser();
  if (!auth) return redirect("/auth/login") as never;

  const parsed = idSchema.safeParse(id);
  if (!parsed.success)
    return err(ErrorCode.NotificationUpdateFailed, "Invalid notification id");

  const now = new Date().toISOString();

  // P6: guard against double-dismiss re-stamping dismissed_at
  const { error: e1 } = await auth.supabase
    .from("notifications")
    .update({ dismissed_at: now })
    .eq("id", parsed.data)
    .eq("user_id", auth.user.id)
    .is("dismissed_at", null);

  if (e1) return err(ErrorCode.NotificationUpdateFailed, e1.message);

  // P3: COALESCE(read_at, now()) — only set read_at if not already read
  const { error: e2 } = await auth.supabase
    .from("notifications")
    .update({ read_at: now })
    .eq("id", parsed.data)
    .eq("user_id", auth.user.id)
    .is("read_at", null);

  if (e2) return err(ErrorCode.NotificationUpdateFailed, e2.message);
  return ok(undefined);
}

// Graceful supplementary — returns 0 on any error so layout/nav never breaks
export async function getUnreadNotificationCount(): Promise<number> {
  const auth = await requireUser();
  if (!auth) return 0;

  try {
    const { count, error } = await auth.supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", auth.user.id)
      .is("read_at", null)
      .is("dismissed_at", null);

    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
