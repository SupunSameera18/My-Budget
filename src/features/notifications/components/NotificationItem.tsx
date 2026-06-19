"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Bell, CalendarCheck, CheckCircle2, Users } from "lucide-react";
import {
  markNotificationRead,
  dismissNotification,
} from "@/features/notifications/server/actions";
import type {
  Notification,
  NotificationType,
} from "@/features/notifications/schema";

const TYPE_ICONS: Record<NotificationType, React.ElementType> = {
  budget_threshold: AlertCircle,
  logging_reminder: Bell,
  month_end_summary: CalendarCheck,
  partner_shared_transaction: Users,
  partner_settled_up: CheckCircle2,
};

function relativeTime(isoString: string): string {
  const diff = Math.max(0, Date.now() - new Date(isoString).getTime());
  if (isNaN(diff)) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface NotificationItemProps {
  notification: Notification;
  onStatusChange: (message: string) => void;
}

export function NotificationItem({
  notification,
  onStatusChange,
}: NotificationItemProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const Icon = TYPE_ICONS[notification.type] ?? Bell;
  const isUnread = notification.read_at === null;

  function handleMarkRead() {
    startTransition(async () => {
      onStatusChange("");
      const result = await markNotificationRead(notification.id);
      onStatusChange(result.ok ? "Marked as read." : "Failed to mark as read.");
      if (result.ok) router.refresh();
    });
  }

  function handleDismiss() {
    startTransition(async () => {
      onStatusChange("");
      const result = await dismissNotification(notification.id);
      onStatusChange(
        result.ok
          ? "Notification dismissed."
          : "Failed to dismiss notification.",
      );
      if (result.ok) router.refresh();
    });
  }

  return (
    <article
      role="article"
      aria-label={notification.title}
      className={`relative flex gap-3 rounded-lg p-4 transition-colors ${
        isUnread
          ? "border-l-2 border-brand-accent bg-card"
          : "border border-hairline bg-card"
      }`}
    >
      <Icon
        strokeWidth={1.75}
        className="mt-0.5 h-5 w-5 shrink-0 text-ink-secondary"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {notification.link ? (
              <Link
                href={notification.link}
                className={`block truncate text-sm hover:underline ${
                  isUnread
                    ? "font-semibold text-ink-primary"
                    : "font-medium text-ink-primary"
                }`}
              >
                {notification.title}
              </Link>
            ) : (
              <p
                className={`truncate text-sm ${
                  isUnread
                    ? "font-semibold text-ink-primary"
                    : "font-medium text-ink-primary"
                }`}
              >
                {notification.title}
              </p>
            )}
            <p className="mt-0.5 text-sm text-ink-secondary">
              {notification.body}
            </p>
          </div>
          <span className="shrink-0 text-xs text-ink-secondary">
            {relativeTime(notification.created_at)}
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          {isUnread && (
            <button
              type="button"
              onClick={handleMarkRead}
              disabled={isPending}
              aria-disabled={isPending ? "true" : undefined}
              className="min-h-[44px] rounded-md px-3 py-2 text-xs font-medium text-brand-accent-strong hover:bg-surface-inset active:opacity-80 disabled:opacity-50"
            >
              Mark read
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            disabled={isPending}
            aria-disabled={isPending ? "true" : undefined}
            className="min-h-[44px] rounded-md px-3 py-2 text-xs font-medium text-ink-secondary hover:bg-surface-inset active:opacity-80 disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      </div>
    </article>
  );
}
