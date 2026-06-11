import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { ErrorCode } from "@/lib/errors";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/supabase/require-user", () => ({
  requireUser: vi.fn(),
}));

import { requireUser } from "@/lib/supabase/require-user";
import { applyMacro } from "./actions";

const mockUser = { id: "user-uuid-1111" };

function makeMockSupabase(rpcResult: { data?: unknown; error?: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("applyMacro", () => {
  it("returns ok({ applicationId }) on success", async () => {
    const appId = "app-uuid-1234";
    (requireUser as Mock).mockResolvedValue({
      supabase: makeMockSupabase({ data: appId, error: null }),
      user: mockUser,
    });

    const result = await applyMacro(
      "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
      "2026-06-11",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.applicationId).toBe(appId);
    }
  });

  it("calls rpc_apply_macro with correct args", async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: "app-id", error: null });
    (requireUser as Mock).mockResolvedValue({
      supabase: { rpc: mockRpc },
      user: mockUser,
    });

    await applyMacro("macro-uuid-abc", "2026-06-11");

    expect(mockRpc).toHaveBeenCalledWith("rpc_apply_macro", {
      p_macro_id: "macro-uuid-abc",
      p_date: "2026-06-11",
    });
  });

  it("returns MacroApplyFailed on P0002 error (macro not found)", async () => {
    (requireUser as Mock).mockResolvedValue({
      supabase: makeMockSupabase({
        data: null,
        error: { code: "P0002", message: "No rows returned" },
      }),
      user: mockUser,
    });

    const result = await applyMacro("some-macro-id", "2026-06-11");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.MacroApplyFailed);
      expect(result.error.message).toMatch(/not found/i);
    }
  });

  it("returns MacroApplyFailed on other DB error", async () => {
    (requireUser as Mock).mockResolvedValue({
      supabase: makeMockSupabase({
        data: null,
        error: { code: "42P01", message: "relation not found" },
      }),
      user: mockUser,
    });

    const result = await applyMacro("some-macro-id", "2026-06-11");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.MacroApplyFailed);
    }
  });
});
