import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { ErrorCode } from "@/lib/errors";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/supabase/require-user", () => ({ requireUser: vi.fn() }));

import { getBudgets } from "./actions";
import { requireUser } from "@/lib/supabase/require-user";

const USER_ID = "uu000000-0001-4000-8000-000000000001";

// Flat chain factory — resolves regardless of method call order (dev-learnings §27)
function makeChain(resolved: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    then: (resolve: unknown, reject: unknown) =>
      Promise.resolve(resolved).then(
        resolve as (v: unknown) => unknown,
        reject as (v: unknown) => unknown,
      ),
  };
  for (const m of ["select", "eq", "is", "order", "gte", "lte"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  return chain;
}

function makeBudgetsSupabase(opts: {
  budgetsData?: unknown[];
  budgetsError?: null | { message: string };
  txnsData?: unknown[];
  txnsError?: null | { message: string };
}) {
  const {
    budgetsData = [],
    budgetsError = null,
    txnsData = [],
    txnsError = null,
  } = opts;

  const budgetsChain = makeChain({ data: budgetsData, error: budgetsError });
  const txnsChain = makeChain({ data: txnsData, error: txnsError });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "budgets") return budgetsChain;
    return txnsChain;
  });

  return { from, txnsChain };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getBudgets", () => {
  it("returns an empty array without querying transactions when there are no budgets", async () => {
    const { from, txnsChain } = makeBudgetsSupabase({ budgetsData: [] });
    (requireUser as Mock).mockResolvedValue({
      supabase: { from },
      user: { id: USER_ID },
    });

    const result = await getBudgets();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual([]);

    // No budgets → the transaction query must never even be issued.
    expect(txnsChain.select as Mock).not.toHaveBeenCalled();
  });

  it("scopes the transaction query to the earliest budget period start (4-1 truncation fix)", async () => {
    const monthlyBudget = {
      id: "bb000000-0001-4000-8000-000000000001",
      user_id: USER_ID,
      name: "Groceries",
      limit_minor: 50000,
      period_type: "custom",
      period_start: "2026-03-01",
      period_end: "2026-03-31",
      archived_at: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
      budget_categories: [
        {
          category_id: "cc000000-0001-4000-8000-000000000001",
          categories: { name: "Groceries" },
        },
      ],
    };
    const olderBudget = {
      ...monthlyBudget,
      id: "bb000000-0002-4000-8000-000000000002",
      period_start: "2026-01-01",
      period_end: "2026-01-31",
    };

    const { from, txnsChain } = makeBudgetsSupabase({
      budgetsData: [monthlyBudget, olderBudget],
      txnsData: [],
    });
    (requireUser as Mock).mockResolvedValue({
      supabase: { from },
      user: { id: USER_ID },
    });

    const result = await getBudgets();
    expect(result.ok).toBe(true);

    // The earliest period_start across both budgets is 2026-01-01 — the
    // transaction query must be bounded to that, not fetch unconditionally.
    expect(txnsChain.gte as Mock).toHaveBeenCalledWith("date", "2026-01-01");
  });

  it("computes actual_minor and pct_used from matching transactions", async () => {
    const budget = {
      id: "bb000000-0003-4000-8000-000000000003",
      user_id: USER_ID,
      name: "Dining",
      limit_minor: 10000,
      period_type: "custom",
      period_start: "2026-04-01",
      period_end: "2026-04-30",
      archived_at: null,
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
      budget_categories: [
        {
          category_id: "cc000000-0002-4000-8000-000000000002",
          categories: { name: "Dining" },
        },
      ],
    };
    const { from } = makeBudgetsSupabase({
      budgetsData: [budget],
      txnsData: [
        {
          amount_minor: 2500,
          date: "2026-04-10",
          category_id: "cc000000-0002-4000-8000-000000000002",
        },
        {
          amount_minor: 100,
          date: "2026-04-15",
          category_id: "cc000000-0099-4000-8000-000000000099", // different category — excluded
        },
      ],
    });
    (requireUser as Mock).mockResolvedValue({
      supabase: { from },
      user: { id: USER_ID },
    });

    const result = await getBudgets();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0].actual_minor).toBe(2500);
      expect(result.data[0].remaining_minor).toBe(7500);
      expect(result.data[0].pct_used).toBe(25);
    }
  });

  it("returns an error when the budgets query fails", async () => {
    const { from } = makeBudgetsSupabase({
      budgetsData: [],
      budgetsError: { message: "boom" },
    });
    (requireUser as Mock).mockResolvedValue({
      supabase: { from },
      user: { id: USER_ID },
    });

    const result = await getBudgets();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.BudgetFetchFailed);
  });

  it("returns Not authenticated when requireUser returns null", async () => {
    (requireUser as Mock).mockResolvedValue(null);
    const result = await getBudgets();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.BudgetFetchFailed);
  });
});
