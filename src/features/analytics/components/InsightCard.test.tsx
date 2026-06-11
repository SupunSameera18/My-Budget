import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InsightCard } from "@/features/analytics/components/InsightCard";
import type { InsightData } from "@/lib/analytics/insights";

const positiveInsight: InsightData = {
  id: "all-budgets-on-track",
  headline: "All budgets on track",
  detail: "2 budget(s) under limit",
  sentiment: "positive",
};

const warningInsight: InsightData = {
  id: "over-budget",
  headline: "Dining is over budget",
  detail: "$5.00 over limit",
  sentiment: "warning",
};

const noDetailInsight: InsightData = {
  id: "strong-savings",
  headline: "Great savings this month",
  sentiment: "positive",
};

describe("InsightCard", () => {
  it("renders headline text", () => {
    render(<InsightCard insight={positiveInsight} />);
    expect(screen.getByText("All budgets on track")).toBeDefined();
  });

  it("renders detail when provided", () => {
    render(<InsightCard insight={positiveInsight} />);
    expect(screen.getByText("2 budget(s) under limit")).toBeDefined();
  });

  it("does not render detail element when detail is undefined", () => {
    render(<InsightCard insight={noDetailInsight} />);
    expect(screen.queryByText(/budget\(s\)/)).toBeNull();
  });

  it("positive sentiment card has border-l-income class", () => {
    const { container } = render(<InsightCard insight={positiveInsight} />);
    expect(container.firstChild?.toString()).toBeDefined();
    expect(container.innerHTML).toContain("border-l-income");
  });

  it("warning sentiment card has border-l-expense class", () => {
    const { container } = render(<InsightCard insight={warningInsight} />);
    expect(container.innerHTML).toContain("border-l-expense");
  });
});
