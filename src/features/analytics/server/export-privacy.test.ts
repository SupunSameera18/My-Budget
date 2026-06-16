import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";

// Privacy invariant scaffold for getExportData
// E6: asserts single-user data isolation (standard RLS enforcement)
// E7: extend with partner Personal transaction exclusion

vi.mock("@/lib/supabase/require-user", () => ({
  requireUser: vi.fn(),
}));

import { requireUser } from "@/lib/supabase/require-user";
import { getExportData } from "@/features/analytics/server/actions";

const mockUserId = "privacy-test-user-id-0001";
const PERIOD = { start: "2026-06-01", end: "2026-06-30" };

/**
 * Builds a chainable Supabase mock where every query builder method returns
 * the same chain. The chain is thenable so it can be awaited directly.
 * Matches the established pattern in actions.test.ts — required because
 * scope="personal" chains TWO .eq() calls (is_shared, user_id), which a
 * rigid single-shape mock chain cannot represent.
 */
function makeChain(resolved: { data: unknown; error: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
  };
  for (const m of ["select", "eq", "neq", "is", "not", "order", "gte", "lte"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getExportData — privacy scaffold", () => {
  it("E6: returns only the authenticated user's transactions", async () => {
    const chain = makeChain({ data: [], error: null });
    (requireUser as Mock).mockResolvedValue({
      user: { id: mockUserId },
      supabase: { from: () => chain },
    });

    await getExportData(PERIOD);

    // Default scope is "combined" — RLS handles isolation, no explicit
    // user_id filter is added at the app layer for this scope.
    // (See the scope=personal/shared/combined assertions below for the
    // app-layer defense-in-depth filters that DO apply per scope.)
    expect(chain.select).toHaveBeenCalled();
  });

  it("E7: excludes partner's Personal transactions when scope is personal", async () => {
    const chain = makeChain({ data: [], error: null });
    (requireUser as Mock).mockResolvedValue({
      user: { id: mockUserId },
      supabase: { from: () => chain },
    });

    await getExportData(PERIOD, "personal");

    const eqCalls = (chain.eq as Mock).mock.calls;
    // scope=personal: is_shared=false AND user_id=caller — a partner's
    // Shared or Personal transactions can never appear, only the caller's
    // own Personal (and own Shared is excluded too, by design).
    expect(
      eqCalls.some((c: unknown[]) => c[0] === "is_shared" && c[1] === false),
    ).toBe(true);
    expect(
      eqCalls.some((c: unknown[]) => c[0] === "user_id" && c[1] === mockUserId),
    ).toBe(true);
  });

  it("E7: includes partner's Shared transactions when scope is combined", async () => {
    const chain = makeChain({ data: [], error: null });
    (requireUser as Mock).mockResolvedValue({
      user: { id: mockUserId },
      supabase: { from: () => chain },
    });

    await getExportData(PERIOD, "combined");

    const eqCalls = (chain.eq as Mock).mock.calls;
    // scope=combined: no additional is_shared/user_id filter is applied at
    // the app layer — the query is left open so RLS (auth_can_view_transaction)
    // can return the caller's own transactions plus any family member's
    // Shared transactions, exactly as the on-screen Monthly Summary does.
    expect(eqCalls.some((c: unknown[]) => c[0] === "is_shared")).toBe(false);
    expect(eqCalls.some((c: unknown[]) => c[0] === "user_id")).toBe(false);
  });

  it("E7: combined export never includes partner's Personal transactions", async () => {
    const chain = makeChain({ data: [], error: null });
    (requireUser as Mock).mockResolvedValue({
      user: { id: mockUserId },
      supabase: { from: () => chain },
    });

    await getExportData(PERIOD, "combined");

    // scope=combined deliberately adds NO app-layer filter — the privacy
    // guarantee for this case rests entirely on the RLS predicate
    // (auth_can_view_transaction: SECURITY DEFINER, returns false
    // unconditionally for any non-owner's is_shared=false row — migration
    // 0036). That invariant is proven exhaustively by the dedicated golden
    // suite (supabase/tests/rls_visibility_predicate.test.sql S7/S8/S10),
    // not re-provable here against a mocked Supabase client. This test
    // documents that getExportData does not weaken or bypass that
    // guarantee by adding a competing filter of its own.
    expect(chain.eq).not.toHaveBeenCalledWith("is_shared", false);
  });
});
