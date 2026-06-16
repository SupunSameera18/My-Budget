import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import * as navigation from "next/navigation";
import { Sidebar } from "./Sidebar";

vi.mock("next/navigation");
vi.mock("@/features/auth/server/actions", () => ({
  signOut: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  (navigation.usePathname as Mock).mockReturnValue("/dashboard");
});

describe("Sidebar", () => {
  it("does not render an unread badge when unreadCount is 0", () => {
    render(<Sidebar unreadCount={0} />);
    expect(
      screen.queryByLabelText(/unread notifications/i),
    ).not.toBeInTheDocument();
  });

  it("does not render an unread badge when unreadCount is omitted", () => {
    render(<Sidebar />);
    expect(
      screen.queryByLabelText(/unread notifications/i),
    ).not.toBeInTheDocument();
  });

  it("renders an unread badge with the count on the Notifications item", () => {
    render(<Sidebar unreadCount={3} />);
    const badge = screen.getByLabelText("3 unread notifications");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("3");
  });

  it("caps the displayed badge count at '9+', mirroring BottomNav", () => {
    render(<Sidebar unreadCount={15} />);
    const badge = screen.getByLabelText("15 unread notifications");
    expect(badge).toHaveTextContent("9+");
  });
});
