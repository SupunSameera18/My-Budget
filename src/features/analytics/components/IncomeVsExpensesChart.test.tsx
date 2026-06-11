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

import { IncomeVsExpensesChart } from "./IncomeVsExpensesChart";

const sampleData = [
  { month: "Jan", Income: 100000, Savings: 20000, Expenses: 80000 },
  { month: "Feb", Income: 90000, Savings: 0, Expenses: 90000 },
];

describe("IncomeVsExpensesChart", () => {
  it("renders bar chart when data is non-empty", () => {
    render(<IncomeVsExpensesChart data={sampleData} currency="USD" />);
    expect(screen.getByTestId("bar-chart")).toBeTruthy();
  });

  it("renders no-data message when data is empty", () => {
    render(<IncomeVsExpensesChart data={[]} currency="USD" />);
    expect(screen.queryByTestId("bar-chart")).toBeNull();
    expect(
      screen.getByText("No income or expense data for this period."),
    ).toBeTruthy();
  });
});
