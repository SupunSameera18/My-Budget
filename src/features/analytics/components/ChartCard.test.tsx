import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChartCard } from "./ChartCard";

describe("ChartCard", () => {
  it("renders title", () => {
    render(<ChartCard title="Spending by Category">content</ChartCard>);
    expect(screen.getByText("Spending by Category")).toBeTruthy();
  });

  it("renders children when isEmpty is false", () => {
    render(
      <ChartCard title="Test" isEmpty={false}>
        <span>chart content</span>
      </ChartCard>,
    );
    expect(screen.getByText("chart content")).toBeTruthy();
  });

  it("renders empty state message when isEmpty is true", () => {
    render(
      <ChartCard
        title="Test"
        isEmpty={true}
        emptyMessage="No data available"
      />,
    );
    expect(screen.getByText("No data available")).toBeTruthy();
  });
});
