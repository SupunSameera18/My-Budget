import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";

vi.mock("@/lib/supabase/require-user", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/features/goals/server/actions", () => ({
  getGoals: vi.fn(),
}));

import { requireUser } from "@/lib/supabase/require-user";
import { getGoals } from "@/features/goals/server/actions";
import {
  getMonthlySummaryData,
  getSpendingByCategoryData,
  getBudgetPerformanceData,
  getThisVsLastMonthData,
} from "@/features/analytics/server/actions";

// ── helpers ────────────────────────────────────────────────────────────────
const PERIOD = { start: "2026-05-01", end: "2026-05-31" };
const mockUser = { id: "user-001" };

const DEFAULT_TXNS = [
  {
    amount_minor: 10000,
    type: "income",
    category_id: "cat-001",
    is_shared: false,
    categories: { name: "Salary" },
  },
  {
    amount_minor: 3000,
    type: "expense",
    category_id: "cat-002",
    is_shared: false,
    categories: { name: "Food" },
  },
  {
    amount_minor: 2000,
    type: "expense",
    category_id: "cat-003",
    is_shared: false,
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

/**
 * Builds a chainable Supabase mock where every query builder method returns
 * the same chain. The chain is thenable so it can be awaited directly.
 * Pass `resolved` as the awaited value for the transactions table.
 */
function makeChain(resolved: { data: unknown; error: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  for (const m of [
    "select",
    "eq",
    "neq",
    "is",
    "not",
    "order",
    "gte",
    "lte",
    "limit",
    "in",
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  return chain;
}

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
        return makeChain({ data: txns, error: txnsError });
      }
      if (table === "budgets") {
        return makeChain({ data: budgets, error: budgetsError });
      }
      if (table === "profiles") {
        return makeChain({ data: { currency }, error: null });
      }
      return makeChain({ data: null, error: null });
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
        is_shared: false,
        categories: { name: "Food" },
      },
      {
        amount_minor: 2000,
        type: "expense",
        category_id: "c2",
        is_shared: false,
        categories: { name: "Transport" },
      },
      {
        amount_minor: 1500,
        type: "expense",
        category_id: "c3",
        is_shared: false,
        categories: { name: "Entertainment" },
      },
      {
        amount_minor: 500,
        type: "expense",
        category_id: "c4",
        is_shared: false,
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
        is_shared: false,
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

// ── scope filter tests ──────────────────────────────────────────────────────
describe("scope filter — applyScopeFilter via server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getGoals as Mock).mockResolvedValue({
      ok: true,
      data: { goals: [], currency: "USD" },
    });
  });

  describe("getSpendingByCategoryData scope", () => {
    it("scope=personal adds is_shared=false and user_id filter", async () => {
      const chain = makeChain({ data: [], error: null });
      const supabaseMock = {
        from: () => chain,
        rpc: () => Promise.resolve({ data: null, error: null }),
      };
      (requireUser as Mock).mockResolvedValue({
        user: mockUser,
        supabase: supabaseMock,
      });

      await getSpendingByCategoryData(PERIOD, "personal");

      const eqCalls = (chain.eq as Mock).mock.calls;
      expect(
        eqCalls.some((c: unknown[]) => c[0] === "is_shared" && c[1] === false),
      ).toBe(true);
      expect(
        eqCalls.some(
          (c: unknown[]) => c[0] === "user_id" && c[1] === mockUser.id,
        ),
      ).toBe(true);
    });

    it("scope=shared adds is_shared=true filter", async () => {
      const chain = makeChain({ data: [], error: null });
      const supabaseMock = {
        from: () => chain,
        rpc: () => Promise.resolve({ data: null, error: null }),
      };
      (requireUser as Mock).mockResolvedValue({
        user: mockUser,
        supabase: supabaseMock,
      });

      await getSpendingByCategoryData(PERIOD, "shared");

      const eqCalls = (chain.eq as Mock).mock.calls;
      expect(
        eqCalls.some((c: unknown[]) => c[0] === "is_shared" && c[1] === true),
      ).toBe(true);
      expect(eqCalls.some((c: unknown[]) => c[0] === "user_id")).toBe(false);
    });

    it("scope=combined adds no is_shared or user_id filter", async () => {
      const chain = makeChain({ data: [], error: null });
      const supabaseMock = {
        from: () => chain,
        rpc: () => Promise.resolve({ data: null, error: null }),
      };
      (requireUser as Mock).mockResolvedValue({
        user: mockUser,
        supabase: supabaseMock,
      });

      await getSpendingByCategoryData(PERIOD, "combined");

      const eqCalls = (chain.eq as Mock).mock.calls;
      expect(eqCalls.some((c: unknown[]) => c[0] === "is_shared")).toBe(false);
      expect(eqCalls.some((c: unknown[]) => c[0] === "user_id")).toBe(false);
    });
  });

  describe("getBudgetPerformanceData scope", () => {
    it("scope=shared returns empty array immediately", async () => {
      (requireUser as Mock).mockResolvedValue({
        user: mockUser,
        supabase: buildSupabaseMock(),
      });
      const result = await getBudgetPerformanceData(PERIOD, "shared");
      expect(result).toEqual([]);
    });

    it("scope=personal returns budget data", async () => {
      (requireUser as Mock).mockResolvedValue({
        user: mockUser,
        supabase: buildSupabaseMock(),
      });
      const result = await getBudgetPerformanceData(PERIOD, "personal");
      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(0);
    });

    it("scope=personal adds is_shared=false filter to budget transactions", async () => {
      const chain = makeChain({ data: [], error: null });
      const supabaseMock = {
        from: (table: string) =>
          table === "budgets" ? makeChain({ data: [], error: null }) : chain,
        rpc: () => Promise.resolve({ data: null, error: null }),
      };
      (requireUser as Mock).mockResolvedValue({
        user: mockUser,
        supabase: supabaseMock,
      });

      await getBudgetPerformanceData(PERIOD, "personal");

      const eqCalls = (chain.eq as Mock).mock.calls;
      expect(
        eqCalls.some((c: unknown[]) => c[0] === "is_shared" && c[1] === false),
      ).toBe(true);
    });
  });

  describe("getMonthlySummaryData scope", () => {
    it("scope=personal adds is_shared=false and user_id filter", async () => {
      const chain = makeChain({ data: [], error: null });
      const supabaseMock = {
        from: (table: string) =>
          table === "transactions"
            ? chain
            : makeChain({ data: [], error: null }),
        rpc: () => Promise.resolve({ data: null, error: null }),
      };
      (requireUser as Mock).mockResolvedValue({
        user: mockUser,
        supabase: supabaseMock,
      });

      await getMonthlySummaryData(PERIOD, "personal");

      const eqCalls = (chain.eq as Mock).mock.calls;
      expect(
        eqCalls.some((c: unknown[]) => c[0] === "is_shared" && c[1] === false),
      ).toBe(true);
      expect(
        eqCalls.some(
          (c: unknown[]) => c[0] === "user_id" && c[1] === mockUser.id,
        ),
      ).toBe(true);
    });

    it("scope=shared adds is_shared=true filter", async () => {
      const chain = makeChain({ data: [], error: null });
      const supabaseMock = {
        from: (table: string) =>
          table === "transactions"
            ? chain
            : makeChain({ data: [], error: null }),
        rpc: () => Promise.resolve({ data: null, error: null }),
      };
      (requireUser as Mock).mockResolvedValue({
        user: mockUser,
        supabase: supabaseMock,
      });

      await getMonthlySummaryData(PERIOD, "shared");

      const eqCalls = (chain.eq as Mock).mock.calls;
      expect(
        eqCalls.some((c: unknown[]) => c[0] === "is_shared" && c[1] === true),
      ).toBe(true);
      expect(eqCalls.some((c: unknown[]) => c[0] === "user_id")).toBe(false);
    });
  });

  describe("getThisVsLastMonthData scope", () => {
    it("scope=personal adds is_shared=false and user_id filter", async () => {
      const chain = makeChain({ data: [], error: null });
      const supabaseMock = {
        from: () => chain,
        rpc: () => Promise.resolve({ data: null, error: null }),
      };
      (requireUser as Mock).mockResolvedValue({
        user: mockUser,
        supabase: supabaseMock,
      });

      await getThisVsLastMonthData("2026-05", "personal");

      const eqCalls = (chain.eq as Mock).mock.calls;
      expect(
        eqCalls.some((c: unknown[]) => c[0] === "is_shared" && c[1] === false),
      ).toBe(true);
      expect(
        eqCalls.some(
          (c: unknown[]) => c[0] === "user_id" && c[1] === mockUser.id,
        ),
      ).toBe(true);
    });

    it("scope=shared adds is_shared=true filter", async () => {
      const chain = makeChain({ data: [], error: null });
      const supabaseMock = {
        from: () => chain,
        rpc: () => Promise.resolve({ data: null, error: null }),
      };
      (requireUser as Mock).mockResolvedValue({
        user: mockUser,
        supabase: supabaseMock,
      });

      await getThisVsLastMonthData("2026-05", "shared");

      const eqCalls = (chain.eq as Mock).mock.calls;
      expect(
        eqCalls.some((c: unknown[]) => c[0] === "is_shared" && c[1] === true),
      ).toBe(true);
      expect(eqCalls.some((c: unknown[]) => c[0] === "user_id")).toBe(false);
    });
  });
});
