"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/feedback/EmptyState";
import { markAllNotificationsRead } from "@/features/notifications/server/actions";
import { NotificationItem } from "./NotificationItem";
import type { Notification } from "@/features/notifications/schema";

interface NotificationListProps {
  notifications: Notification[];
}

export function NotificationList({ notifications }: NotificationListProps) {
  const [statusMessage, setStatusMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const hasUnread = notifications.some((n) => n.read_at === null);

  function handleMarkAllRead() {
    startTransition(async () => {
      setStatusMessage("");
      const result = await markAllNotificationsRead();
      setStatusMessage(
        result.ok
          ? "All notifications marked as read."
          : "Failed to mark all as read.",
      );
      if (result.ok) router.refresh();
    });
  }

  return (
    <>
      {/* ARIA live region — always in DOM (§9 enforced check) */}
      <div aria-live="polite" role="status" className="sr-only">
        {statusMessage}
      </div>

      {notifications.length === 0 ? (
        <EmptyState heading="No notifications" body="You're all caught up." />
      ) : (
        <>
          {hasUnread && (
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={isPending}
                aria-disabled={isPending ? "true" : undefined}
                className="min-h-[44px] rounded-md px-4 py-2 text-sm font-medium text-brand-accent-strong hover:bg-surface-inset active:opacity-80 disabled:opacity-50"
              >
                Mark all as read
              </button>
            </div>
          )}
          <ul role="list" className="flex flex-col gap-3">
            {notifications.map((n) => (
              <li key={n.id}>
                <NotificationItem
                  notification={n}
                  onStatusChange={setStatusMessage}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
