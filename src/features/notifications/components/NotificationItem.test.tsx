import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}));
vi.mock("@/features/notifications/server/actions", () => ({
  markNotificationRead: vi.fn(),
  dismissNotification: vi.fn(),
}));

import { NotificationItem } from "./NotificationItem";
import {
  markNotificationRead,
  dismissNotification,
} from "@/features/notifications/server/actions";
import type { Notification } from "@/features/notifications/schema";

const BASE_NOTIF: Notification = {
  id: "11111111-9001-4000-8000-000000000001",
  type: "budget_threshold",
  title: "Budget Alert",
  body: "You have used 80% of your groceries budget.",
  link: null,
  metadata: {},
  read_at: null,
  dismissed_at: null,
  created_at: new Date(Date.now() - 60000).toISOString(),
};

const mockStatusChange = vi.fn();

function renderItem(overrides: Partial<Notification> = {}) {
  return render(
    <NotificationItem
      notification={{ ...BASE_NOTIF, ...overrides }}
      onStatusChange={mockStatusChange}
    />,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(markNotificationRead).mockResolvedValue({
    ok: true,
    data: undefined,
  });
  vi.mocked(dismissNotification).mockResolvedValue({
    ok: true,
    data: undefined,
  });
});

describe("NotificationItem", () => {
  it("renders with role=article and aria-label matching title", () => {
    renderItem();
    expect(
      screen.getByRole("article", { name: "Budget Alert" }),
    ).toBeInTheDocument();
  });

  it("shows 'Mark read' button for unread notifications", () => {
    renderItem({ read_at: null });
    expect(
      screen.getByRole("button", { name: "Mark read" }),
    ).toBeInTheDocument();
  });

  it("hides 'Mark read' button for already-read notifications", () => {
    renderItem({ read_at: "2026-06-16T00:00:00Z" });
    expect(
      screen.queryByRole("button", { name: "Mark read" }),
    ).not.toBeInTheDocument();
  });

  it("always shows 'Dismiss' button", () => {
    renderItem();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("renders title as a Link when notification.link is set", () => {
    renderItem({ link: "/budgets" });
    const link = screen.getByRole("link", { name: "Budget Alert" });
    expect(link).toHaveAttribute("href", "/budgets");
  });

  it("calls markNotificationRead and notifies parent on success", async () => {
    renderItem();
    fireEvent.click(screen.getByRole("button", { name: "Mark read" }));
    await waitFor(() => {
      expect(vi.mocked(markNotificationRead)).toHaveBeenCalledWith(
        BASE_NOTIF.id,
      );
      expect(mockStatusChange).toHaveBeenCalledWith("Marked as read.");
    });
  });

  it("calls dismissNotification and notifies parent on success", async () => {
    renderItem();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => {
      expect(vi.mocked(dismissNotification)).toHaveBeenCalledWith(
        BASE_NOTIF.id,
      );
      expect(mockStatusChange).toHaveBeenCalledWith("Notification dismissed.");
    });
  });

  it("reports error message to parent when markRead fails", async () => {
    vi.mocked(markNotificationRead).mockResolvedValue({
      ok: false,
      error: {
        code: "notification_update_failed" as never,
        message: "db error",
      },
    });
    renderItem();
    fireEvent.click(screen.getByRole("button", { name: "Mark read" }));
    await waitFor(() => {
      expect(mockStatusChange).toHaveBeenCalledWith("Failed to mark as read.");
    });
  });
});
