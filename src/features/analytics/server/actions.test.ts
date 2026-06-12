import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";

vi.mock("@/lib/supabase/require-user", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/features/goals/server/actions", () => ({
  getGoals: vi.fn(),
}));

import { requireUser } from "@/lib/supabase/require-user";
import { getGoals } from "@/features/goals/server/actions";
import { getMonthlySummaryData } from "@/features/analytics/server/actions";

// ── helpers ────────────────────────────────────────────────────────────────
const PERIOD = { start: "2026-05-01", end: "2026-05-31" };
const mockUser = { id: "user-001" };

const DEFAULT_TXNS = [
  {
    amount_minor: 10000,
    type: "income",
    category_id: "cat-001",
    categories: { name: "Salary" },
  },
  {
    amount_minor: 3000,
    type: "expense",
    category_id: "cat-002",
    categories: { name: "Food" },
  },
  {
    amount_minor: 2000,
    type: "expense",
    category_id: "cat-003",
    categories: { name: "Transport" },
  },
];

const DEFAULT_BUDGETS = [
  {
    id: "bud-001",
    name: "Food Budget",
    limit_minor: 5000,
    budget_categories: [{ category_id: "cat-002" }],
  },
];

function buildSupabaseMock(
  opts: {
    txns?: typeof DEFAULT_TXNS;
    txnsError?: { message: string };
    budgets?: typeof DEFAULT_BUDGETS;
    budgetsError?: { message: string };
    currency?: string;
  } = {},
) {
  const txns = opts.txns ?? DEFAULT_TXNS;
  const txnsError = opts.txnsError ?? null;
  const budgets = opts.budgets ?? DEFAULT_BUDGETS;
  const budgetsError = opts.budgetsError ?? null;
  const currency = opts.currency ?? "USD";

  return {
    from: (table: string) => {
      if (table === "transactions") {
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({
                lte: () => ({
                  is: () => ({
                    in: () => Promise.resolve({ data: txns, error: txnsError }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "budgets") {
        return {
          select: () => ({
            eq: () => ({
              is: () => Promise.resolve({ data: budgets, error: budgetsError }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: { currency }, error: null }),
            }),
          }),
        };
      }
      return {};
    },
    // rpc needed because getMonthlySummaryData calls getHealthScore internally
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
}

// ── tests ──────────────────────────────────────────────────────────────────
describe("getMonthlySummaryData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getGoals as Mock).mockResolvedValue({
      ok: true,
      data: { goals: [], currency: "USD" },
    });
  });

  it("returns null when requireUser returns null (unauthenticated)", async () => {
    (requireUser as Mock).mockResolvedValue(null);
    const result = await getMonthlySummaryData(PERIOD);
    expect(result).toBeNull();
  });

  it("returns income, expense, and net totals correctly", async () => {
    (requireUser as Mock).mockResolvedValue({
      user: mockUser,
      supabase: buildSupabaseMock(),
    });
    const result = await getMonthlySummaryData(PERIOD);
    expect(result).not.toBeNull();
    expect(result!.incomeMinor).toBe(10000);
    expect(result!.expenseMinor).toBe(5000);
    expect(result!.netMinor).toBe(5000);
  });

  it("returns correct period in result", async () => {
    (requireUser as Mock).mockResolvedValue({
      user: mockUser,
      supabase: buildSupabaseMock(),
    });
    const result = await getMonthlySummaryData(PERIOD);
    expect(result!.period).toEqual(PERIOD);
  });

  it("returns top-3 categories sorted by expense descending", async () => {
    const txns = [
      {
        amount_minor: 4000,
        type: "expense",
        category_id: "c1",
        categories: { name: "Food" },
      },
      {
        amount_minor: 2000,
        type: "expense",
        category_id: "c2",
        categories: { name: "Transport" },
      },
      {
        amount_minor: 1500,
        type: "expense",
        category_id: "c3",
        categories: { name: "Entertainment" },
      },
      {
        amount_minor: 500,
        type: "expense",
        category_id: "c4",
        categories: { name: "Other" },
      },
    ];
    (requireUser as Mock).mockResolvedValue({
      user: mockUser,
      supabase: buildSupabaseMock({ txns }),
    });
    const result = await getMonthlySummaryData(PERIOD);
    expect(result!.topCategories).toHaveLength(3);
    expect(result!.topCategories[0].name).toBe("Food");
    expect(result!.topCategories[0].amountMinor).toBe(4000);
    expect(result!.topCategories[1].name).toBe("Transport");
    expect(result!.topCategories[2].name).toBe("Entertainment");
  });

  it("returns budget actuals for selected period", async () => {
    (requireUser as Mock).mockResolvedValue({
      user: mockUser,
      supabase: buildSupabaseMock(),
    });
    const result = await getMonthlySummaryData(PERIOD);
    expect(result!.budgets).toHaveLength(1);
    expect(result!.budgets[0].name).toBe("Food Budget");
    expect(result!.budgets[0].actualMinor).toBe(3000);
    expect(result!.budgets[0].limitMinor).toBe(5000);
    expect(result!.budgets[0].hit).toBe(false);
  });

  it("marks budget as hit when actualMinor >= limitMinor", async () => {
    const txns = [
      {
        amount_minor: 6000,
        type: "expense",
        category_id: "cat-002",
        categories: { name: "Food" },
      },
    ];
    (requireUser as Mock).mockResolvedValue({
      user: mockUser,
      supabase: buildSupabaseMock({ txns }),
    });
    const result = await getMonthlySummaryData(PERIOD);
    expect(result!.budgets[0].hit).toBe(true);
  });

  it("returns goals from getGoals()", async () => {
    const mockGoals = [
      {
        id: "g1",
        name: "Vacation",
        target_minor: 100000,
        currentMinor: 30000,
        remaining_minor: 70000,
        pctUsed: 30,
        created_at: "2026-01-01",
      },
    ];
    (getGoals as Mock).mockResolvedValue({
      ok: true,
      data: { goals: mockGoals, currency: "USD" },
    });
    (requireUser as Mock).mockResolvedValue({
      user: mockUser,
      supabase: buildSupabaseMock(),
    });
    const result = await getMonthlySummaryData(PERIOD);
    expect(result!.goals).toHaveLength(1);
    expect(result!.goals[0].name).toBe("Vacation");
  });

  it("returns empty goals array when getGoals fails", async () => {
    (getGoals as Mock).mockResolvedValue({ ok: false });
    (requireUser as Mock).mockResolvedValue({
      user: mockUser,
      supabase: buildSupabaseMock(),
    });
    const result = await getMonthlySummaryData(PERIOD);
    expect(result!.goals).toEqual([]);
  });

  it("returns null on transaction fetch error", async () => {
    (requireUser as Mock).mockResolvedValue({
      user: mockUser,
      supabase: buildSupabaseMock({
        txnsError: { message: "DB error" },
      }),
    });
    const result = await getMonthlySummaryData(PERIOD);
    expect(result).toBeNull();
  });

  it("returns correct currency from profile", async () => {
    (requireUser as Mock).mockResolvedValue({
      user: mockUser,
      supabase: buildSupabaseMock({ currency: "EUR" }),
    });
    const result = await getMonthlySummaryData(PERIOD);
    expect(result!.currency).toBe("EUR");
  });
});
