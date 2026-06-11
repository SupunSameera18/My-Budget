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

import { BudgetPerformanceChart } from "./BudgetPerformanceChart";

const sampleData = [
  { name: "Groceries", Budget: 50000, Actual: 32000 },
  { name: "Dining", Budget: 30000, Actual: 28000 },
];

describe("BudgetPerformanceChart", () => {
  it("renders bar chart when data is non-empty", () => {
    render(<BudgetPerformanceChart data={sampleData} currency="USD" />);
    expect(screen.getByTestId("bar-chart")).toBeTruthy();
  });

  it("renders 'No active budgets.' message when data is empty", () => {
    render(<BudgetPerformanceChart data={[]} currency="USD" />);
    expect(screen.queryByTestId("bar-chart")).toBeNull();
    expect(screen.getByText("No active budgets.")).toBeTruthy();
  });
});
