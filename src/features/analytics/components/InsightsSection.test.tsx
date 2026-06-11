import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InsightsSection } from "@/features/analytics/components/InsightsSection";
import type { InsightData } from "@/lib/analytics/insights";

const mockInsights: InsightData[] = [
  {
    id: "all-budgets-on-track",
    headline: "All budgets on track",
    detail: "2 budget(s) under limit",
    sentiment: "positive",
  },
  {
    id: "income-up",
    headline: "Income up this month",
    detail: "Up 10% from last month",
    sentiment: "positive",
  },
];

describe("InsightsSection", () => {
  it("renders nothing (returns null) when insights array is empty", () => {
    const { container } = render(<InsightsSection insights={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one InsightCard per item when insights has entries", () => {
    render(<InsightsSection insights={mockInsights} />);
    expect(screen.getByText("All budgets on track")).toBeDefined();
    expect(screen.getByText("Income up this month")).toBeDefined();
  });

  it("renders section with aria-label='Insights' when cards are present", () => {
    render(<InsightsSection insights={mockInsights} />);
    expect(screen.getByRole("region", { name: "Insights" })).toBeDefined();
  });

  it("renders 'Insights' heading when cards are present", () => {
    render(<InsightsSection insights={mockInsights} />);
    expect(screen.getByText("Insights")).toBeDefined();
  });
});
