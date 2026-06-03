import { describe, it, expect } from "vitest";
import {
  currentMonthStart,
  currentMonthEnd,
  currentMonthBoundaries,
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
