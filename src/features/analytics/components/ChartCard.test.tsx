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

  it("appends (Personal) suffix when scope=personal", () => {
    render(
      <ChartCard title="Spending" scope="personal">
        content
      </ChartCard>,
    );
    expect(screen.getByText("(Personal)")).toBeTruthy();
  });

  it("appends (Shared) suffix when scope=shared", () => {
    render(
      <ChartCard title="Spending" scope="shared">
        content
      </ChartCard>,
    );
    expect(screen.getByText("(Shared)")).toBeTruthy();
  });

  it("shows no suffix when scope=combined", () => {
    render(
      <ChartCard title="Spending" scope="combined">
        content
      </ChartCard>,
    );
    expect(screen.queryByText("(Combined)")).toBeNull();
    expect(screen.queryByText("(Personal)")).toBeNull();
  });

  it("shows no suffix when scope is not provided", () => {
    render(<ChartCard title="Spending">content</ChartCard>);
    expect(screen.queryByText("(Personal)")).toBeNull();
    expect(screen.queryByText("(Shared)")).toBeNull();
  });
});
