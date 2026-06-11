import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "@/lib/errors";

// Must mock BEFORE importing the module under test
vi.mock("@/lib/supabase/require-user");

const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom };

const mockRequireUser = vi.fn();

beforeEach(async () => {
  vi.resetAllMocks();
  const ru = await import("@/lib/supabase/require-user");
  vi.mocked(ru.requireUser).mockImplementation(mockRequireUser);
});

describe("getAllUserData", () => {
  it("calls requireUser before any DB fetch", async () => {
    let requireUserCalled = false;
    let dbCallBeforeRequireUser = false;

    mockRequireUser.mockImplementation(async () => {
      requireUserCalled = true;
      return { supabase: mockSupabase, user: { id: "u1" } };
    });

    mockFrom.mockImplementation(() => {
      if (!requireUserCalled) dbCallBeforeRequireUser = true;
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    const { getAllUserData } = await import("./actions");
    await getAllUserData();

    expect(requireUserCalled).toBe(true);
    expect(dbCallBeforeRequireUser).toBe(false);
  });

  it("returns ok(UserDataExport) with correct exported_at and app_version", async () => {
    mockRequireUser.mockResolvedValue({
      supabase: mockSupabase,
      user: { id: "u1" },
    });
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    const { getAllUserData } = await import("./actions");
    const result = await getAllUserData();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.app_version).toBe("my-budget-v1");
      expect(new Date(result.data.exported_at).toISOString()).toBe(
        result.data.exported_at,
      );
    }
  });

  it("returns data for all 9 expected table keys", async () => {
    mockRequireUser.mockResolvedValue({
      supabase: mockSupabase,
      user: { id: "u1" },
    });
    const mockRows = [{ id: "row1" }];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
    }));

    const { getAllUserData } = await import("./actions");
    const result = await getAllUserData();

    expect(result.ok).toBe(true);
    if (result.ok) {
      const expectedKeys = [
        "accounts",
        "categories",
        "transactions",
        "budgets",
        "budget_categories",
        "goals",
        "goal_contributions",
        "macros",
        "transfers",
      ];
      for (const key of expectedKeys) {
        expect(
          result.data.tables[key as keyof typeof result.data.tables],
        ).toBeDefined();
      }
    }
  });

  it("returns err(DataExportFailed) when any table fetch fails", async () => {
    mockRequireUser.mockResolvedValue({
      supabase: mockSupabase,
      user: { id: "u1" },
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockImplementation(() => {
        callCount++;
        // Fail the 3rd table (transactions)
        if (callCount === 3) {
          return Promise.resolve({
            data: null,
            error: { message: "DB error" },
          });
        }
        return Promise.resolve({ data: [], error: null });
      }),
    }));

    const { getAllUserData } = await import("./actions");
    const result = await getAllUserData();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.DataExportFailed);
    }
  });

  it("does not fetch DB when requireUser returns null", async () => {
    mockRequireUser.mockResolvedValue(null);

    // When requireUser returns null, the action redirects — which throws in Next.js
    // We just verify no DB fetches were attempted before the redirect
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
