import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { ok, err, ErrorCode } from "@/lib/errors";

vi.mock("@/features/dashboard/server/actions", () => ({
  getLoggingGridData: vi.fn(),
}));

import { getLoggingGridData } from "@/features/dashboard/server/actions";
import { LoggingGrid } from "./LoggingGrid";

// June 2026: starts on Sunday (offset=6), 30 days, today=2026-06-10
const baseData = {
  datesWithActivity: [] as string[],
  todayStr: "2026-06-10",
  daysInMonth: 30,
  monthYear: "2026-06",
  firstWeekdayOffset: 6,
};

describe("LoggingGrid", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders null when getLoggingGridData returns an error", async () => {
    (getLoggingGridData as Mock).mockResolvedValue(
      err(ErrorCode.LoggingGridFetchFailed, "Failed"),
    );
    const jsx = await LoggingGrid();
    expect(jsx).toBeNull();
  });

  it("renders 30 dots for a 30-day month", async () => {
    (getLoggingGridData as Mock).mockResolvedValue(ok(baseData));
    render(await LoggingGrid());
    // 30 dots — one per day
    const dots = screen.getAllByRole("img");
    expect(dots).toHaveLength(30);
  });

  it("today's dot has aria-label containing '(today)'", async () => {
    (getLoggingGridData as Mock).mockResolvedValue(ok(baseData));
    render(await LoggingGrid());
    const todayDot = screen.getByLabelText(/Day 10.*today/);
    expect(todayDot).toBeDefined();
  });

  it("today's empty dot has teal border class (ring state)", async () => {
    (getLoggingGridData as Mock).mockResolvedValue(ok(baseData));
    render(await LoggingGrid());
    const todayDot = screen.getByLabelText(/Day 10.*today/);
    expect(todayDot.className).toContain("border-brand-accent");
    expect(todayDot.className).not.toContain("bg-brand-accent");
  });

  it("unfilled non-today dot has border-hairline only", async () => {
    (getLoggingGridData as Mock).mockResolvedValue(ok(baseData));
    render(await LoggingGrid());
    const day5 = screen.getByLabelText("Day 5");
    expect(day5.className).toContain("border-hairline");
    expect(day5.className).not.toContain("bg-brand-accent");
  });

  it("dot with activity is filled with teal background", async () => {
    (getLoggingGridData as Mock).mockResolvedValue(
      ok({ ...baseData, datesWithActivity: ["2026-06-05"] }),
    );
    render(await LoggingGrid());
    const day5 = screen.getByLabelText(/Day 5.*logged/);
    expect(day5.className).toContain("bg-brand-accent");
  });

  it("today's dot when filled has both teal fill and ring", async () => {
    (getLoggingGridData as Mock).mockResolvedValue(
      ok({ ...baseData, datesWithActivity: ["2026-06-10"] }),
    );
    render(await LoggingGrid());
    const todayDot = screen.getByLabelText(/Day 10.*today.*logged/);
    expect(todayDot.className).toContain("bg-brand-accent");
    expect(todayDot.className).toContain("ring-brand-accent");
  });

  it("ARIA labels are correct for each state", async () => {
    (getLoggingGridData as Mock).mockResolvedValue(
      ok({ ...baseData, datesWithActivity: ["2026-06-05"] }),
    );
    render(await LoggingGrid());
    // Unfilled non-today
    expect(screen.getByLabelText("Day 1")).toBeDefined();
    // Filled non-today
    expect(screen.getByLabelText("Day 5 (logged)")).toBeDefined();
    // Today unfilled
    expect(screen.getByLabelText("Day 10 (today)")).toBeDefined();
  });
});
