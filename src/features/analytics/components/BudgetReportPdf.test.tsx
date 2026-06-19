import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BudgetReportPdf } from "./BudgetReportPdf";
import type { MonthlySummaryData } from "@/features/analytics/server/actions";
import type { ExportRow } from "@/features/analytics/schema";

vi.mock("@react-pdf/renderer", () => ({
  Document: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Page: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Text: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  StyleSheet: { create: <T extends object>(s: T) => s },
  pdf: vi.fn(() => ({
    toBlob: vi.fn().mockResolvedValue(new Blob(["fake-pdf"])),
  })),
}));

const baseSummary: MonthlySummaryData = {
  period: { start: "2026-05-01", end: "2026-05-31" },
  currency: "USD",
  incomeMinor: 500000,
  expenseMinor: 300000,
  netMinor: 200000,
  topCategories: [
    { name: "Groceries", amountMinor: 150000 },
    { name: "Transport", amountMinor: 80000 },
  ],
  budgets: [
    {
      id: "b1",
      name: "Food",
      limitMinor: 200000,
      actualMinor: 150000,
      pctUsed: 75,
      hit: false,
    },
  ],
  goals: [],
  healthScore: { score: 72, confidencePercent: 85, hasEnoughData: true },
};

const baseRows: ExportRow[] = [
  {
    date: "2026-05-01",
    amount: "50.00",
    type: "expense",
    category: "Groceries",
    account: "Bank",
    note: "",
  },
  {
    date: "2026-05-15",
    amount: "123.45",
    type: "income",
    category: "Salary",
    account: "Bank",
    note: "May salary",
  },
];

describe("BudgetReportPdf", () => {
  it("renders selectedMonth in the heading", () => {
    render(
      <BudgetReportPdf
        summary={baseSummary}
        rows={baseRows}
        selectedMonth="2026-05"
      />,
    );
    // Use getAllByText since 2026-05 also appears in row dates
    const matches = screen.getAllByText(/Monthly Summary — 2026-05/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("renders income total", () => {
    render(
      <BudgetReportPdf
        summary={baseSummary}
        rows={baseRows}
        selectedMonth="2026-05"
      />,
    );
    expect(screen.getByText(/\$5,000\.00/)).toBeTruthy();
  });

  it("renders expense total", () => {
    render(
      <BudgetReportPdf
        summary={baseSummary}
        rows={baseRows}
        selectedMonth="2026-05"
      />,
    );
    expect(screen.getByText(/\$3,000\.00/)).toBeTruthy();
  });

  it("renders Health Score when non-null", () => {
    render(
      <BudgetReportPdf
        summary={baseSummary}
        rows={baseRows}
        selectedMonth="2026-05"
      />,
    );
    expect(screen.getByText(/72\/100/)).toBeTruthy();
  });

  it("does NOT render Health Score when null", () => {
    const summaryNoHealth = { ...baseSummary, healthScore: null };
    render(
      <BudgetReportPdf
        summary={summaryNoHealth}
        rows={baseRows}
        selectedMonth="2026-05"
      />,
    );
    expect(screen.queryByText(/Health Score/)).toBeNull();
  });

  it("renders correct row count", () => {
    render(
      <BudgetReportPdf
        summary={baseSummary}
        rows={baseRows}
        selectedMonth="2026-05"
      />,
    );
    expect(screen.getByText(/Transactions \(2\)/)).toBeTruthy();
  });

  it("does NOT render Top Categories section when empty", () => {
    const summaryNoCats = { ...baseSummary, topCategories: [] };
    render(
      <BudgetReportPdf
        summary={summaryNoCats}
        rows={baseRows}
        selectedMonth="2026-05"
      />,
    );
    expect(screen.queryByText(/Top Spending Categories/)).toBeNull();
  });
});
