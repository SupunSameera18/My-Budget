import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

import { MonthSelector } from "./MonthSelector";

describe("MonthSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the month label in 'Month YYYY' format", () => {
    render(<MonthSelector selectedMonth="2026-05" />);
    expect(screen.getByText("May 2026")).toBeTruthy();
  });

  it("renders 'Previous month' button", () => {
    render(<MonthSelector selectedMonth="2026-05" />);
    expect(
      screen.getByRole("button", { name: /previous month/i }),
    ).toBeTruthy();
  });

  it("renders 'Next month' button", () => {
    render(<MonthSelector selectedMonth="2026-05" />);
    expect(screen.getByRole("button", { name: /next month/i })).toBeTruthy();
  });

  it("next button is aria-disabled when selectedMonth is current month", () => {
    const now = new Date();
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    render(<MonthSelector selectedMonth={currentMonth} />);
    const nextBtn = screen.getByRole("button", { name: /next month/i });
    expect(nextBtn.getAttribute("aria-disabled")).toBe("true");
  });

  it("next button is NOT aria-disabled when selectedMonth is in the past", () => {
    render(<MonthSelector selectedMonth="2026-01" />);
    const nextBtn = screen.getByRole("button", { name: /next month/i });
    expect(nextBtn.getAttribute("aria-disabled")).toBe("false");
  });

  it("clicking previous navigates to prior month", () => {
    render(<MonthSelector selectedMonth="2026-05" />);
    const prevBtn = screen.getByRole("button", { name: /previous month/i });
    fireEvent.click(prevBtn);
    expect(mockReplace).toHaveBeenCalledWith("?month=2026-04");
  });

  it("clicking next navigates to next month when not current", () => {
    render(<MonthSelector selectedMonth="2026-05" />);
    const nextBtn = screen.getByRole("button", { name: /next month/i });
    fireEvent.click(nextBtn);
    expect(mockReplace).toHaveBeenCalledWith("?month=2026-06");
  });

  it("previous wraps correctly across year boundary (Jan → Dec prior year)", () => {
    render(<MonthSelector selectedMonth="2026-01" />);
    const prevBtn = screen.getByRole("button", { name: /previous month/i });
    fireEvent.click(prevBtn);
    expect(mockReplace).toHaveBeenCalledWith("?month=2025-12");
  });

  it("buttons meet WCAG minimum hit area (min-h-[44px])", () => {
    render(<MonthSelector selectedMonth="2026-05" />);
    const prevBtn = screen.getByRole("button", { name: /previous month/i });
    expect(prevBtn.className).toContain("min-h-[44px]");
    expect(prevBtn.className).toContain("min-w-[44px]");
  });
});
