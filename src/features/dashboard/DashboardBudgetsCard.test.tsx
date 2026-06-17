import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { ok, err, ErrorCode } from "@/lib/errors";
import type { BudgetWithActual } from "@/features/budgets/schema";

vi.mock("@/features/budgets/server/actions", () => ({
  getBudgets: vi.fn(),
  getUserCurrency: vi.fn(),
}));

import { DashboardBudgetsCard } from "./DashboardBudgetsCard";
import { getBudgets, getUserCurrency } from "@/features/budgets/server/actions";

function makeBudget(
  overrides: Partial<BudgetWithActual> & { pct_used: number },
): BudgetWithActual {
  return {
    id: overrides.id ?? "budget-1",
    user_id: "user-1",
    name: overrides.name ?? "Budget",
    limit_minor: overrides.limit_minor ?? 10000,
    actual_minor: overrides.actual_minor ?? 0,
    remaining_minor: overrides.remaining_minor ?? 10000,
    pct_used: overrides.pct_used,
    categories: overrides.categories ?? [],
    period_type: "monthly",
    period_start: null,
    period_end: null,
    archived_at: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
  };
}

const fourBudgets: BudgetWithActual[] = [
  makeBudget({
    id: "b1",
    name: "Groceries",
    pct_used: 90,
    remaining_minor: 1000,
    actual_minor: 9000,
    limit_minor: 10000,
  }),
  makeBudget({
    id: "b2",
    name: "Transport",
    pct_used: 60,
    remaining_minor: 4000,
    actual_minor: 6000,
    limit_minor: 10000,
  }),
  makeBudget({
    id: "b3",
    name: "Dining",
    pct_used: 75,
    remaining_minor: 2500,
    actual_minor: 7500,
    limit_minor: 10000,
  }),
  makeBudget({
    id: "b4",
    name: "Entertainment",
    pct_used: 30,
    remaining_minor: 7000,
    actual_minor: 3000,
    limit_minor: 10000,
  }),
];

describe("DashboardBudgetsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getBudgets as Mock).mockResolvedValue(ok([]));
    (getUserCurrency as Mock).mockResolvedValue("USD");
  });

  it("returns null when getBudgets returns an error", async () => {
    (getBudgets as Mock).mockResolvedValue(
      err(ErrorCode.BudgetFetchFailed, "DB error"),
    );
    const jsx = await DashboardBudgetsCard();
    expect(jsx).toBeNull();
  });

  it("renders compact prompt card when no active budgets", async () => {
    (getBudgets as Mock).mockResolvedValue(ok([]));
    const jsx = await DashboardBudgetsCard();
    render(jsx!);
    expect(screen.getByText(/No budgets yet\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create one" })).toBeTruthy();
  });

  it("renders top 3 budgets sorted by pct_used descending", async () => {
    (getBudgets as Mock).mockResolvedValue(ok(fourBudgets));
    const jsx = await DashboardBudgetsCard();
    render(jsx!);
    // Should show Groceries (90%), Dining (75%), Transport (60%) — NOT Entertainment (30%)
    expect(screen.getByText("Groceries")).toBeTruthy();
    expect(screen.getByText("Dining")).toBeTruthy();
    expect(screen.getByText("Transport")).toBeTruthy();
    expect(screen.queryByText("Entertainment")).toBeNull();
  });

  it("shows '+N more' text when totalBudgets > 3", async () => {
    (getBudgets as Mock).mockResolvedValue(ok(fourBudgets));
    const jsx = await DashboardBudgetsCard();
    render(jsx!);
    expect(screen.getByText(/\+1 more/)).toBeTruthy();
  });

  it("does not show '+N more' when totalBudgets <= 3", async () => {
    (getBudgets as Mock).mockResolvedValue(ok(fourBudgets.slice(0, 3)));
    const jsx = await DashboardBudgetsCard();
    render(jsx!);
    expect(screen.queryByText(/\+ more/)).toBeNull();
    expect(screen.queryByText(/more/)).toBeNull();
  });

  it("shows amber 'X over' text for over-budget row", async () => {
    const overBudget = makeBudget({
      id: "b-over",
      name: "Over Budget",
      pct_used: 110,
      actual_minor: 11000,
      limit_minor: 10000,
      remaining_minor: -1000,
    });
    (getBudgets as Mock).mockResolvedValue(ok([overBudget]));
    const jsx = await DashboardBudgetsCard();
    render(jsx!);
    const overText = screen.getByText(/over/);
    expect(overText).toBeTruthy();
    expect(overText.className).toContain("text-breathing-low-text");
  });

  it("shows 'X left' text for within-budget row", async () => {
    const withinBudget = makeBudget({
      id: "b-within",
      name: "Within Budget",
      pct_used: 50,
      actual_minor: 5000,
      limit_minor: 10000,
      remaining_minor: 5000,
    });
    (getBudgets as Mock).mockResolvedValue(ok([withinBudget]));
    const jsx = await DashboardBudgetsCard();
    render(jsx!);
    const leftText = screen.getByText(/left/);
    expect(leftText).toBeTruthy();
    expect(leftText.className).toContain("text-ink-secondary");
    expect(leftText.className).not.toContain("text-breathing-low-text");
  });
});
