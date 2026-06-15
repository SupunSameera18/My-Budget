import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}));
vi.mock("@/features/notifications/server/actions", () => ({
  markNotificationRead: vi.fn(),
  dismissNotification: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

import { NotificationList } from "./NotificationList";
import { markAllNotificationsRead } from "@/features/notifications/server/actions";
import type { Notification } from "@/features/notifications/schema";

const UNREAD_NOTIF: Notification = {
  id: "11111111-9001-4000-8000-000000000001",
  type: "logging_reminder",
  title: "Log your spending",
  body: "Don't forget to log today's transactions.",
  link: null,
  metadata: {},
  read_at: null,
  dismissed_at: null,
  created_at: new Date().toISOString(),
};

const READ_NOTIF: Notification = {
  id: "11111111-9001-4000-8000-000000000002",
  type: "month_end_summary",
  title: "May summary ready",
  body: "Your May spending summary is available.",
  link: "/summary",
  metadata: {},
  read_at: "2026-06-01T00:00:00Z",
  dismissed_at: null,
  created_at: "2026-06-01T00:00:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(markAllNotificationsRead).mockResolvedValue({
    ok: true,
    data: undefined,
  });
});

describe("NotificationList", () => {
  it("renders EmptyState when notifications is empty", () => {
    render(<NotificationList notifications={[]} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "No notifications",
    );
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
  });

  it("renders a list item per notification", () => {
    render(<NotificationList notifications={[UNREAD_NOTIF, READ_NOTIF]} />);
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("shows 'Mark all as read' button when there are unread notifications", () => {
    render(<NotificationList notifications={[UNREAD_NOTIF]} />);
    expect(
      screen.getByRole("button", { name: "Mark all as read" }),
    ).toBeInTheDocument();
  });

  it("hides 'Mark all as read' button when all are read", () => {
    render(<NotificationList notifications={[READ_NOTIF]} />);
    expect(
      screen.queryByRole("button", { name: "Mark all as read" }),
    ).not.toBeInTheDocument();
  });

  it("ARIA live region is always in DOM", () => {
    render(<NotificationList notifications={[]} />);
    const live = screen.getByRole("status");
    expect(live).toBeInTheDocument();
  });

  it("calls markAllNotificationsRead and updates status message on success", async () => {
    render(<NotificationList notifications={[UNREAD_NOTIF]} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    await waitFor(() => {
      expect(vi.mocked(markAllNotificationsRead)).toHaveBeenCalledOnce();
      expect(screen.getByRole("status")).toHaveTextContent(
        "All notifications marked as read.",
      );
    });
  });

  it("shows error message in status region when markAll fails", async () => {
    vi.mocked(markAllNotificationsRead).mockResolvedValue({
      ok: false,
      error: {
        code: "notification_update_failed" as never,
        message: "db error",
      },
    });
    render(<NotificationList notifications={[UNREAD_NOTIF]} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Failed to mark all as read.",
      );
    });
  });
});
