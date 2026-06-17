import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "@/lib/errors";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/features/accounts/server/actions", () => ({
  getAccounts: vi.fn(),
}));

import {
  saveTransactionDefaults,
  getTransactionFormData,
  splitTransactionAction,
  reclassifyTransaction,
  getTransactionList,
} from "./actions";
import { requireUser } from "@/lib/supabase/require-user";
import { getAccounts } from "@/features/accounts/server/actions";

const USER_ID = "11111111-7005-4000-8000-000000000099";

function makeChain(result: { data?: unknown; error?: unknown }) {
  const chain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({
      data: result.data ?? null,
      error: result.error ?? null,
    }),
  };
  return chain;
}

function mockAuthWithUpdateChain(updateResult: { error?: unknown } = {}) {
  const chain = makeChain({ error: updateResult.error ?? null });
  vi.mocked(requireUser).mockResolvedValue({
    supabase: {
      from: vi.fn().mockReturnValue(chain),
    } as never,
    user: { id: USER_ID } as never,
  });
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── saveTransactionDefaults ───────────────────────────────────────────────────

describe("saveTransactionDefaults", () => {
  it("calls requireUser first (§9 — before any DB call)", async () => {
    const chain = mockAuthWithUpdateChain();
    await saveTransactionDefaults({ defaultType: "shared" });
    expect(vi.mocked(requireUser)).toHaveBeenCalledOnce();
    expect(chain.update).toHaveBeenCalled();
  });

  it("updates profiles.transaction_defaults with the given value", async () => {
    const chain = mockAuthWithUpdateChain();
    const defaults = {
      defaultType: "shared" as const,
      defaultSplitMethod: "equal" as const,
    };
    await saveTransactionDefaults(defaults);
    expect(chain.update).toHaveBeenCalledWith({
      transaction_defaults: defaults,
    });
    expect(chain.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("returns ok(undefined) on success", async () => {
    mockAuthWithUpdateChain();
    const result = await saveTransactionDefaults({ defaultType: "personal" });
    expect(result.ok).toBe(true);
  });

  it("returns err(TransactionDefaultsSaveFailed) when unauthenticated", async () => {
    vi.mocked(requireUser).mockResolvedValue(null);
    const result = await saveTransactionDefaults({ defaultType: "personal" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.TransactionDefaultsSaveFailed);
    }
  });

  it("returns err(TransactionDefaultsSaveFailed) when DB update fails", async () => {
    mockAuthWithUpdateChain({ error: { message: "db error" } });
    const result = await saveTransactionDefaults({ defaultType: "shared" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.TransactionDefaultsSaveFailed);
    }
  });
});

// ── getTransactionFormData (family fields) ────────────────────────────────────

describe("getTransactionFormData — isFamilyMode + transactionDefaults", () => {
  // Build a flexible from() mock that handles all tables queried by getTransactionFormData.
  // profiles is queried twice: once with .single() for currency/subcategories,
  // once with .maybeSingle() for transaction_defaults.
  // Build a thenable chain that can be awaited directly OR via .single()/.maybeSingle().
  // This handles Supabase query chains that end with either a terminal method or a
  // bare await (PostgrestFilterBuilder is a thenable in real Supabase JS).
  function makeThenableChain(resolved: { data: unknown; error: unknown }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      then: (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve(resolved).then(resolve, reject),
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
    ]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    return chain;
  }

  function buildFromMock({
    membership,
    txDefaults,
  }: {
    membership: object | null;
    txDefaults: object | null;
  }) {
    return vi.fn().mockImplementation((table: string) => {
      if (table === "family_members") {
        const chain = makeThenableChain({ data: membership, error: null });
        chain.maybeSingle = vi
          .fn()
          .mockResolvedValue({ data: membership, error: null });
        return chain;
      }

      if (table === "profiles") {
        // profiles is queried twice: select("currency, subcategories_enabled").single()
        // and select("transaction_defaults").maybeSingle()
        const profileData = {
          currency: "USD",
          subcategories_enabled: false,
          transaction_defaults: txDefaults,
        };
        const chain = makeThenableChain({ data: profileData, error: null });
        chain.single = vi
          .fn()
          .mockResolvedValue({ data: profileData, error: null });
        chain.maybeSingle = vi.fn().mockResolvedValue({
          data:
            txDefaults !== null ? { transaction_defaults: txDefaults } : null,
          error: null,
        });
        return chain;
      }

      if (table === "categories") {
        // chain ends with .order().order() — awaited directly (thenable)
        return makeThenableChain({ data: [], error: null });
      }

      if (table === "transactions") {
        // queried twice:
        //   lastTxn: ...is().order().limit().maybeSingle()
        //   monthTxns: ...gte().lte().is() — awaited directly (thenable)
        const chain = makeThenableChain({ data: [], error: null });
        chain.maybeSingle = vi
          .fn()
          .mockResolvedValue({ data: null, error: null });
        return chain;
      }

      if (table === "macros") {
        // chain ends with .order().order() — awaited directly (thenable)
        return makeThenableChain({ data: [], error: null });
      }

      return makeThenableChain({ data: null, error: null });
    });
  }

  function setupMocks({
    membership,
    txDefaults,
  }: {
    membership: object | null;
    txDefaults: object | null;
  }) {
    vi.mocked(requireUser).mockResolvedValue({
      supabase: {
        from: buildFromMock({ membership, txDefaults }),
      } as never,
      user: { id: USER_ID } as never,
    });

    vi.mocked(getAccounts).mockResolvedValue({
      ok: true,
      data: [
        {
          id: "acc-1",
          user_id: USER_ID,
          name: "Cash",
          type: "cash",
          currency: "USD",
          actual_balance_minor: 0,
          archived_at: null,
          created_at: "",
          updated_at: "",
        },
      ],
    });
  }

  it("returns isFamilyMode=true when family_members row exists", async () => {
    setupMocks({ membership: { family_unit_id: "fam-1" }, txDefaults: null });
    const result = await getTransactionFormData();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.isFamilyMode).toBe(true);
  });

  it("returns isFamilyMode=false when no family_members row", async () => {
    setupMocks({ membership: null, txDefaults: null });
    const result = await getTransactionFormData();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.isFamilyMode).toBe(false);
  });

  it("returns transactionDefaults from profile when present", async () => {
    const defaults = {
      defaultType: "shared" as const,
      defaultSplitMethod: "equal" as const,
    };
    setupMocks({
      membership: { family_unit_id: "fam-1" },
      txDefaults: defaults,
    });
    const result = await getTransactionFormData();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.transactionDefaults).toEqual(defaults);
  });

  it("returns transactionDefaults=null when profile has no defaults", async () => {
    setupMocks({ membership: null, txDefaults: null });
    const result = await getTransactionFormData();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.transactionDefaults).toBeNull();
  });
});

// ── splitTransactionAction ───────────────────────────────────────────────────

const VALID_TX_ID = "22222222-7006-4000-8000-000000000001";

function mockRpcSplit(rpcResult: {
  data?: unknown;
  error?: { code: string; message: string } | null;
}) {
  const rpc = vi.fn().mockResolvedValue({
    data: rpcResult.data ?? null,
    error: rpcResult.error ?? null,
  });
  vi.mocked(requireUser).mockResolvedValue({
    supabase: { rpc } as never,
    user: { id: USER_ID } as never,
  });
  return rpc;
}

describe("splitTransactionAction", () => {
  it("calls requireUser first before any RPC (§9)", async () => {
    const rpc = mockRpcSplit({});
    await splitTransactionAction(VALID_TX_ID, "equal", 500, 500);
    expect(vi.mocked(requireUser)).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalled();
  });

  it("returns SplitTransactionFailed when unauthenticated", async () => {
    vi.mocked(requireUser).mockResolvedValue(null);
    const result = await splitTransactionAction(VALID_TX_ID, "equal", 500, 500);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.SplitTransactionFailed);
  });

  it("returns SplitTransactionFailed for invalid UUID", async () => {
    mockRpcSplit({});
    const result = await splitTransactionAction(
      "not-a-uuid",
      "equal",
      500,
      500,
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.SplitTransactionFailed);
  });

  it("branches P0001 → personal transaction message (§9 ERRCODE rule)", async () => {
    mockRpcSplit({
      error: { code: "P0001", message: "cannot split a personal transaction" },
    });
    const result = await splitTransactionAction(VALID_TX_ID, "equal", 500, 500);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.SplitTransactionFailed);
      expect(result.error.message).toContain("personal transaction");
    }
  });

  it("branches 23514 → math mismatch message (§9 ERRCODE rule)", async () => {
    mockRpcSplit({
      error: { code: "23514", message: "split amounts do not sum" },
    });
    const result = await splitTransactionAction(VALID_TX_ID, "fixed", 400, 400);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.SplitTransactionFailed);
      expect(result.error.message).toContain("do not add up");
    }
  });

  it("branches 42501 → access denied message (§9 ERRCODE rule)", async () => {
    mockRpcSplit({ error: { code: "42501", message: "access denied" } });
    const result = await splitTransactionAction(VALID_TX_ID, "equal", 500, 500);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.SplitTransactionFailed);
      expect(result.error.message).toContain("access");
    }
  });

  it("returns ok() on success", async () => {
    mockRpcSplit({});
    const result = await splitTransactionAction(VALID_TX_ID, "equal", 500, 500);
    expect(result.ok).toBe(true);
  });
});

// ── reclassifyTransaction ────────────────────────────────────────────────────

const VALID_RECLASSIFY_TX_ID = "33333333-7008-4000-8000-000000000001";

function mockRpcReclassify(rpcResult: {
  data?: unknown;
  error?: { code: string; message: string } | null;
}) {
  const rpc = vi.fn().mockResolvedValue({
    data: rpcResult.data ?? null,
    error: rpcResult.error ?? null,
  });
  vi.mocked(requireUser).mockResolvedValue({
    supabase: { rpc } as never,
    user: { id: USER_ID } as never,
  });
  return rpc;
}

describe("reclassifyTransaction", () => {
  it("calls requireUser first before any RPC (§9)", async () => {
    const rpc = mockRpcReclassify({});
    await reclassifyTransaction(VALID_RECLASSIFY_TX_ID, true);
    expect(vi.mocked(requireUser)).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalled();
  });

  it("returns ReclassifyTransactionFailed when unauthenticated", async () => {
    vi.mocked(requireUser).mockResolvedValue(null);
    const result = await reclassifyTransaction(VALID_RECLASSIFY_TX_ID, true);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.ReclassifyTransactionFailed);
  });

  it("returns ReclassifyTransactionFailed for invalid UUID", async () => {
    mockRpcReclassify({});
    const result = await reclassifyTransaction("not-a-uuid", true);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.ReclassifyTransactionFailed);
  });

  it("branches P0001 → already that type message (§9 ERRCODE rule)", async () => {
    mockRpcReclassify({
      error: { code: "P0001", message: "already that type" },
    });
    const result = await reclassifyTransaction(VALID_RECLASSIFY_TX_ID, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.ReclassifyTransactionFailed);
      expect(result.error.message).toContain("already that type");
    }
  });

  it("branches 42501 → access denied message (§9 ERRCODE rule)", async () => {
    mockRpcReclassify({ error: { code: "42501", message: "access denied" } });
    const result = await reclassifyTransaction(VALID_RECLASSIFY_TX_ID, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.ReclassifyTransactionFailed);
      expect(result.error.message).toContain("permission");
    }
  });

  it("returns ok() on success", async () => {
    mockRpcReclassify({});
    const result = await reclassifyTransaction(VALID_RECLASSIFY_TX_ID, true);
    expect(result.ok).toBe(true);
  });
});

// ── getTransactionList ────────────────────────────────────────────────────────

function makeListChain(resolved: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {
    then: (resolve: unknown, reject: unknown) =>
      Promise.resolve({
        data: resolved.data,
        error: resolved.error ?? null,
      }).then(
        resolve as (v: unknown) => unknown,
        reject as (v: unknown) => unknown,
      ),
    single: vi.fn().mockResolvedValue({
      data: resolved.data,
      error: resolved.error ?? null,
    }),
  };
  for (const m of ["select", "eq", "is", "order", "limit", "gte", "lte"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  return chain;
}

function mockAuthForList(opts: { txnsData: unknown[] }) {
  const txnsChain = makeListChain({ data: opts.txnsData });
  const accountsChain = makeListChain({ data: [] });
  const categoriesChain = makeListChain({ data: [] });
  const profileChain = makeListChain({ data: { currency: "USD" } });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "transactions") return txnsChain;
    if (table === "accounts") return accountsChain;
    if (table === "categories") return categoriesChain;
    return profileChain;
  });

  vi.mocked(requireUser).mockResolvedValue({
    supabase: { from } as never,
    user: { id: USER_ID } as never,
  });

  return { txnsChain };
}

describe("getTransactionList", () => {
  it("requests one row beyond the page size and reports hasMore=false under the cap", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `aaaaaaaa-0000-4000-8000-00000000000${i}`,
      account_id: "bb000000-0000-4000-8000-000000000000",
      category_id: "cc000000-0000-4000-8000-000000000000",
      amount_minor: 100,
      date: "2026-06-01",
      note: null,
      type: "expense",
      is_shared: false,
      created_at: "2026-06-01T00:00:00Z",
      accounts: { name: "Cash" },
      categories: { name: "Groceries", type: "expense" },
    }));
    const { txnsChain } = mockAuthForList({ txnsData: rows });

    const result = await getTransactionList({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items).toHaveLength(3);
      expect(result.data.hasMore).toBe(false);
    }
    expect(txnsChain.limit).toHaveBeenCalledWith(501);
  });

  it("trims to 500 and sets hasMore=true when 501 rows come back (3-4 truncation signal)", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      id: `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`,
      account_id: "bb000000-0000-4000-8000-000000000000",
      category_id: "cc000000-0000-4000-8000-000000000000",
      amount_minor: 100,
      date: "2026-06-01",
      note: null,
      type: "expense",
      is_shared: false,
      created_at: "2026-06-01T00:00:00Z",
      accounts: { name: "Cash" },
      categories: { name: "Groceries", type: "expense" },
    }));
    mockAuthForList({ txnsData: rows });

    const result = await getTransactionList({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items).toHaveLength(500);
      expect(result.data.hasMore).toBe(true);
    }
  });
});
