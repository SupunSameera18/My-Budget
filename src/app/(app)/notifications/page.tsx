import { getNotifications } from "@/features/notifications/server/actions";
import { NotificationList } from "@/features/notifications/components/NotificationList";
import { PushSubscriptionToggle } from "@/features/notifications/components/PushSubscriptionToggle";
import { IosInstallNudge } from "@/features/notifications/components/IosInstallNudge";

export default async function NotificationsPage() {
  const result = await getNotifications();
  const notifications = result.ok ? result.data : [];
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-6 text-xl font-bold text-ink-primary">
        Notifications{unreadCount > 0 ? ` (${unreadCount})` : ""}
      </h1>
      <PushSubscriptionToggle />
      <NotificationList notifications={notifications} />
      <IosInstallNudge />
    </div>
  );
}
