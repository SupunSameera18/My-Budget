import { z } from "zod";

export interface ReminderPreferences {
  reminder_enabled: boolean;
  reminder_time: string | null;
  reminder_timezone: string | null;
}

export type NotificationType =
  | "logging_reminder"
  | "budget_threshold"
  | "month_end_summary"
  | "partner_shared_transaction"
  | "partner_settled_up";

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

// Server-side validation for subscribePush (Phase 2 gap analysis, 7-2/3d) —
// the browser-supplied subscription object reaches a server action as plain
// JSON with no runtime guarantee of its shape; validate before it's written
// to push_subscriptions. endpoint must be an https URL (Web Push always
// delivers over HTTPS); the VAPID-derived keys are base64url strings.
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().startsWith("https://"),
  keys: z.object({
    p256dh: z
      .string()
      .min(20)
      .regex(/^[A-Za-z0-9_=-]+$/, "p256dh must be base64url-encoded"),
    auth: z
      .string()
      .min(10)
      .regex(/^[A-Za-z0-9_=-]+$/, "auth must be base64url-encoded"),
  }),
}) satisfies z.ZodType<PushSubscriptionJSON>;
