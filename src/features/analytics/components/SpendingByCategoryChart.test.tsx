import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@tremor/react", () => ({
  DonutChart: ({ data }: { data: { name: string; value: number }[] }) => (
    <div data-testid="donut-chart" data-count={String(data.length)}>
      {data.map((d) => (
        <span key={d.name}>{d.name}</span>
      ))}
    </div>
  ),
}));

vi.mock("@/lib/format", () => ({
  formatMoney: vi.fn((v: number, c: string) => `${c} ${v}`),
}));

import { SpendingByCategoryChart } from "./SpendingByCategoryChart";

const sampleData = [
  { name: "Food", value: 5000 },
  { name: "Transport", value: 3000 },
];

describe("SpendingByCategoryChart", () => {
  it("renders donut chart when data is non-empty", () => {
    render(<SpendingByCategoryChart data={sampleData} currency="USD" />);
    expect(screen.getByTestId("donut-chart")).toBeTruthy();
  });

  it("renders legend items for each data item", () => {
    render(<SpendingByCategoryChart data={sampleData} currency="USD" />);
    expect(screen.getAllByText("Food").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Transport").length).toBeGreaterThan(0);
  });

  it("renders no-data message and hides chart when data is empty", () => {
    render(<SpendingByCategoryChart data={[]} currency="USD" />);
    expect(screen.getByText("No expense data for this period.")).toBeTruthy();
    expect(screen.queryByTestId("donut-chart")).toBeNull();
  });

  it("accepts scope prop without TypeScript error (compile check)", () => {
    render(
      <SpendingByCategoryChart
        data={sampleData}
        currency="USD"
        scope="personal"
      />,
    );
    expect(screen.getByTestId("donut-chart")).toBeTruthy();
  });
});
