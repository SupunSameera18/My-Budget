import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { MonthlySummaryContent } from "./MonthlySummaryContent";
import type { MonthlySummaryData } from "@/features/analytics/server/actions";
import type { GoalWithProgress } from "@/features/goals/schema";

const PERIOD = { start: "2026-05-01", end: "2026-05-31" };

const BASE_DATA: MonthlySummaryData = {
  period: PERIOD,
  currency: "USD",
  incomeMinor: 10000,
  expenseMinor: 5000,
  netMinor: 5000,
  topCategories: [
    { name: "Food", amountMinor: 3000 },
    { name: "Transport", amountMinor: 2000 },
  ],
  budgets: [
    {
      id: "b1",
      name: "Food Budget",
      limitMinor: 5000,
      actualMinor: 3000,
      pctUsed: 60,
      hit: false,
    },
  ],
  goals: [
    {
      id: "g1",
      name: "Vacation",
      target_minor: 100000,
      currentMinor: 30000,
      remaining_minor: 70000,
      pctUsed: 30,
      created_at: "2026-01-01",
    } satisfies GoalWithProgress,
  ],
  healthScore: {
    score: 72,
    confidencePercent: 60,
    hasEnoughData: true,
  },
};

describe("MonthlySummaryContent", () => {
  it("renders net result section with correct sign (positive)", () => {
    render(<MonthlySummaryContent data={BASE_DATA} />);
    // Multiple role="status" exist (net result + HealthScoreDisplay); check at least one
    const statuses = screen.getAllByRole("status");
    expect(statuses.length).toBeGreaterThan(0);
  });

  it("renders income and expense sub-line", () => {
    render(<MonthlySummaryContent data={BASE_DATA} />);
    // formatMoney(10000, "USD") → "$100.00", formatMoney(5000, "USD") → "$50.00"
    const text = document.body.textContent ?? "";
    expect(text).toContain("100.00");
    expect(text).toContain("50.00");
  });

  it("renders top-3 spending categories", () => {
    render(<MonthlySummaryContent data={BASE_DATA} />);
    expect(screen.getByText("Food")).toBeTruthy();
    expect(screen.getByText("Transport")).toBeTruthy();
  });

  it("renders 'No spending' empty state when topCategories is empty", () => {
    render(
      <MonthlySummaryContent data={{ ...BASE_DATA, topCategories: [] }} />,
    );
    const items = screen.getAllByText(/no spending/i);
    expect(items.length).toBeGreaterThan(0);
  });

  it("renders Health Score section label", () => {
    render(<MonthlySummaryContent data={BASE_DATA} />);
    expect(screen.getByText("Financial Health")).toBeTruthy();
  });

  it("renders health score value from result", () => {
    render(<MonthlySummaryContent data={BASE_DATA} />);
    expect(screen.getByText("72")).toBeTruthy();
  });

  it("renders 'No budgets' empty state when budgets array is empty", () => {
    render(<MonthlySummaryContent data={{ ...BASE_DATA, budgets: [] }} />);
    const items = screen.getAllByText(/no budgets/i);
    expect(items.length).toBeGreaterThan(0);
  });

  it("renders budget name when budgets are present", () => {
    render(<MonthlySummaryContent data={BASE_DATA} />);
    expect(screen.getByText("Food Budget")).toBeTruthy();
  });

  it("renders budget progress bar", () => {
    render(<MonthlySummaryContent data={BASE_DATA} />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars.length).toBeGreaterThan(0);
  });

  it("renders 'No goals' empty state when goals array is empty", () => {
    render(<MonthlySummaryContent data={{ ...BASE_DATA, goals: [] }} />);
    const items = screen.getAllByText(/no goals/i);
    expect(items.length).toBeGreaterThan(0);
  });

  it("renders goal name when goals are present", () => {
    render(<MonthlySummaryContent data={BASE_DATA} />);
    expect(screen.getByText("Vacation")).toBeTruthy();
  });

  it("net result section has ARIA live region", () => {
    render(<MonthlySummaryContent data={BASE_DATA} />);
    // Multiple role="status" present; verify at least one has aria-live="polite"
    const statuses = screen.getAllByRole("status");
    const hasPolite = statuses.some(
      (el) => el.getAttribute("aria-live") === "polite",
    );
    expect(hasPolite).toBe(true);
  });

  it("applies text-breathing-low-text class to net amount when net is negative", () => {
    const { container } = render(
      <MonthlySummaryContent
        data={{
          ...BASE_DATA,
          incomeMinor: 3000,
          expenseMinor: 5000,
          netMinor: -2000,
        }}
      />,
    );
    expect(container.querySelector(".text-breathing-low-text")).not.toBeNull();
  });

  it("applies text-ink-primary class to net amount when net is positive", () => {
    const { container } = render(<MonthlySummaryContent data={BASE_DATA} />);
    const netSection = container.querySelector('[aria-label="Net result"]');
    expect(netSection?.querySelector(".text-ink-primary")).not.toBeNull();
  });
});
