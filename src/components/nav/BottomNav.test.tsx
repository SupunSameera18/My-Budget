import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import * as navigation from "next/navigation";
import { BottomNav } from "./BottomNav";

vi.mock("next/navigation");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("BottomNav", () => {
  it("applies teal tint class to the active nav item", () => {
    (navigation.usePathname as Mock).mockReturnValue("/dashboard");
    render(<BottomNav />);

    const homeLink = screen.getByRole("link", { name: /home/i });
    expect(homeLink.className).toContain("text-brand-accent");
  });

  it("does not introduce any non-DESIGN.md brand hue classes", () => {
    (navigation.usePathname as Mock).mockReturnValue("/dashboard");
    const { container } = render(<BottomNav />);
    const html = container.innerHTML;

    const forbidden = [
      /text-red-/,
      /text-blue-/,
      /text-purple-/,
      /text-yellow-/,
      /text-pink-/,
      /text-orange-/,
      /text-green-/,
      /text-indigo-/,
      /text-violet-/,
      /text-emerald-/,
      /text-sky-/,
      /text-cyan-/,
      /text-teal-/,
      /text-lime-/,
      /text-rose-/,
      /text-fuchsia-/,
      /text-amber-/,
    ];

    for (const pattern of forbidden) {
      expect(html).not.toMatch(pattern);
    }
  });

  it("renders the FAB as a square tile (rounded-lg, not rounded-full)", () => {
    (navigation.usePathname as Mock).mockReturnValue("/dashboard");
    const { container } = render(<BottomNav />);

    const fab = screen.getByRole("link", { name: /add transaction/i });
    expect(fab.className).toContain("rounded-lg");
    expect(fab.className).not.toContain("rounded-full");

    // Plus icon is inside the FAB
    const plusIcon = container.querySelector(
      '[aria-label="Add transaction"] svg',
    );
    expect(plusIcon).not.toBeNull();
  });

  it("applies inactive class to non-active nav items", () => {
    (navigation.usePathname as Mock).mockReturnValue("/dashboard");
    render(<BottomNav />);

    const txLink = screen.getByRole("link", { name: /transactions/i });
    expect(txLink.className).toContain("text-ink-secondary");
    expect(txLink.className).not.toContain("text-brand-accent");
  });

  it("does not render an unread badge when unreadCount is 0", () => {
    (navigation.usePathname as Mock).mockReturnValue("/dashboard");
    render(<BottomNav unreadCount={0} />);
    expect(
      screen.queryByLabelText(/unread notifications/i),
    ).not.toBeInTheDocument();
  });

  it("renders an unread badge with the count on the More item", () => {
    (navigation.usePathname as Mock).mockReturnValue("/dashboard");
    render(<BottomNav unreadCount={3} />);
    const badge = screen.getByLabelText("3 unread notifications");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("3");
  });

  it("caps the displayed badge count at '9+'", () => {
    (navigation.usePathname as Mock).mockReturnValue("/dashboard");
    render(<BottomNav unreadCount={15} />);
    const badge = screen.getByLabelText("15 unread notifications");
    expect(badge).toHaveTextContent("9+");
  });
});
