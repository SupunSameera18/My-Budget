import { describe, it, expect } from "vitest";
import {
  currentMonthStart,
  currentMonthEnd,
  currentMonthBoundaries,
  currentWeekBoundaries,
  currentYearBoundaries,
  monthBoundaries,
} from "./period";

// Pinned reference dates — eliminates real-clock dependency and month-boundary races
const JUN_15 = new Date(Date.UTC(2026, 5, 15)); // June 15, 2026
const FEB_15_LEAP = new Date(Date.UTC(2024, 1, 15)); // Feb 15, 2024 (leap year)
const FEB_15_NOLEAP = new Date(Date.UTC(2025, 1, 15)); // Feb 15, 2025 (non-leap)

describe("currentMonthStart", () => {
  it("returns YYYY-MM-DD format", () => {
    expect(currentMonthStart(JUN_15)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("returns the 1st of the month", () => {
    expect(currentMonthStart(JUN_15)).toBe("2026-06-01");
  });
});

describe("currentMonthEnd", () => {
  it("returns YYYY-MM-DD format", () => {
    expect(currentMonthEnd(JUN_15)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("is on or after start", () => {
    expect(currentMonthEnd(JUN_15) >= currentMonthStart(JUN_15)).toBe(true);
  });
  it("day is at least 28 (every month has >= 28 days)", () => {
    const day = parseInt(currentMonthEnd(JUN_15).split("-")[2], 10);
    expect(day).toBeGreaterThanOrEqual(28);
  });
  it("returns the last day of June (30th)", () => {
    expect(currentMonthEnd(JUN_15)).toBe("2026-06-30");
  });
  it("handles February in a leap year (29 days)", () => {
    expect(currentMonthEnd(FEB_15_LEAP)).toBe("2024-02-29");
  });
  it("handles February in a non-leap year (28 days)", () => {
    expect(currentMonthEnd(FEB_15_NOLEAP)).toBe("2025-02-28");
  });
});

describe("currentMonthBoundaries", () => {
  it("start and end are in the same calendar month", () => {
    const { start, end } = currentMonthBoundaries();
    expect(start.slice(0, 7)).toBe(end.slice(0, 7));
  });
  it("start ends with -01", () => {
    expect(currentMonthBoundaries().start.endsWith("-01")).toBe(true);
  });
  it("end day is at least 28", () => {
    const day = parseInt(currentMonthBoundaries().end.split("-")[2], 10);
    expect(day).toBeGreaterThanOrEqual(28);
  });
});

// ---- Story 4.1: currentWeekBoundaries + currentYearBoundaries ----

const WED_JUN_10 = new Date(Date.UTC(2026, 5, 10)); // Wednesday 2026-06-10
const SUN_JUN_14 = new Date(Date.UTC(2026, 5, 14)); // Sunday 2026-06-14 (end of ISO week)
const MON_JUN_08 = new Date(Date.UTC(2026, 5, 8)); // Monday 2026-06-08 (start of ISO week)

describe("currentWeekBoundaries", () => {
  it("returns Monday as start for a Wednesday", () => {
    expect(currentWeekBoundaries(WED_JUN_10).start).toBe("2026-06-08");
  });
  it("returns Sunday as end for a Wednesday", () => {
    expect(currentWeekBoundaries(WED_JUN_10).end).toBe("2026-06-14");
  });
  it("handles Sunday correctly — Sunday is the END of an ISO week, not the start", () => {
    expect(currentWeekBoundaries(SUN_JUN_14).start).toBe("2026-06-08");
    expect(currentWeekBoundaries(SUN_JUN_14).end).toBe("2026-06-14");
  });
  it("handles Monday correctly — Monday is the START of an ISO week", () => {
    expect(currentWeekBoundaries(MON_JUN_08).start).toBe("2026-06-08");
    expect(currentWeekBoundaries(MON_JUN_08).end).toBe("2026-06-14");
  });
});

// ---- Story 6.2: monthBoundaries ----

describe("monthBoundaries", () => {
  it("returns correct boundaries for May 2026 (31 days)", () => {
    const { start, end } = monthBoundaries("2026-05");
    expect(start).toBe("2026-05-01");
    expect(end).toBe("2026-05-31");
  });

  it("returns correct boundaries for February 2026 (non-leap, 28 days)", () => {
    const { start, end } = monthBoundaries("2026-02");
    expect(start).toBe("2026-02-01");
    expect(end).toBe("2026-02-28");
  });

  it("returns correct boundaries for February 2024 (leap year, 29 days)", () => {
    const { start, end } = monthBoundaries("2024-02");
    expect(start).toBe("2024-02-01");
    expect(end).toBe("2024-02-29");
  });

  it("returns correct boundaries for December (31 days)", () => {
    const { start, end } = monthBoundaries("2026-12");
    expect(start).toBe("2026-12-01");
    expect(end).toBe("2026-12-31");
  });
});

const JAN_15_2026 = new Date(Date.UTC(2026, 0, 15));
const DEC_31_2025 = new Date(Date.UTC(2025, 11, 31));

describe("currentYearBoundaries", () => {
  it("returns Jan 1 as start", () => {
    expect(currentYearBoundaries(JAN_15_2026).start).toBe("2026-01-01");
  });
  it("returns Dec 31 as end", () => {
    expect(currentYearBoundaries(JAN_15_2026).end).toBe("2026-12-31");
  });
  it("accepts a now override — Dec 31 2025 returns 2025 boundaries", () => {
    expect(currentYearBoundaries(DEC_31_2025).start).toBe("2025-01-01");
    expect(currentYearBoundaries(DEC_31_2025).end).toBe("2025-12-31");
  });
  it("uses UTC year (YYYY-01-01 / YYYY-12-31 format)", () => {
    expect(currentYearBoundaries(JAN_15_2026).start).toMatch(/^\d{4}-01-01$/);
    expect(currentYearBoundaries(JAN_15_2026).end).toMatch(/^\d{4}-12-31$/);
  });
});
