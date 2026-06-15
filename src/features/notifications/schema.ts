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
