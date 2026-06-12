import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@tremor/react", () => ({
  BarChart: ({ data }: { data: Record<string, unknown>[] }) => (
    <div data-testid="bar-chart" data-count={String(data.length)} />
  ),
}));

vi.mock("@/lib/format", () => ({
  formatMoney: vi.fn((v: number, c: string) => `${c} ${v}`),
}));

import { ThisVsLastMonthChart } from "./ThisVsLastMonthChart";

const sampleData = [
  { category: "Food", "This Month": 5000, "Last Month": 4000 },
  { category: "Transport", "This Month": 3000, "Last Month": 2500 },
];

describe("ThisVsLastMonthChart", () => {
  it("renders bar chart when data is non-empty", () => {
    render(<ThisVsLastMonthChart data={sampleData} currency="USD" />);
    expect(screen.getByTestId("bar-chart")).toBeTruthy();
  });

  it("renders no-data message when data is empty", () => {
    render(<ThisVsLastMonthChart data={[]} currency="USD" />);
    expect(screen.queryByTestId("bar-chart")).toBeNull();
    expect(screen.getByText("No expense data for this period.")).toBeTruthy();
  });
});
