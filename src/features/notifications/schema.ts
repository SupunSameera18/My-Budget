export interface ReminderPreferences {
  reminder_enabled: boolean;
  reminder_time: string | null;
  reminder_timezone: string | null;
}

export type NotificationType =
  | "logging_reminder"
  | "budget_threshold"
  | "month_end_summary"
  | "partner_shared_transaction";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
}

// Plain-object shape of the browser's PushSubscription.toJSON() — a class
// instance with methods cannot cross the server-action serialization
// boundary, so the client must call `.toJSON()` before passing it.
export interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}
