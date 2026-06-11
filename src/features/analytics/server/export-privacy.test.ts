import { describe, it, expect, vi, beforeEach } from "vitest";

// Privacy invariant scaffold for getExportData
// E6: asserts single-user data isolation (standard RLS enforcement)
// E7: extend with partner Personal transaction exclusion

const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null });
const mockIs = vi.fn().mockReturnValue({ order: mockOrder });
const mockLte = vi.fn().mockReturnValue({ is: mockIs });
const mockGte = vi.fn().mockReturnValue({ lte: mockLte });
const mockEq = vi.fn().mockReturnValue({ gte: mockGte });
const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

vi.mock("@/lib/supabase/require-user", () => ({
  requireUser: vi.fn(),
}));

const mockUserId = "privacy-test-user-id-0001";

beforeEach(() => {
  vi.clearAllMocks();
  mockOrder.mockResolvedValue({ data: [], error: null });
  mockIs.mockReturnValue({ order: mockOrder });
  mockLte.mockReturnValue({ is: mockIs });
  mockGte.mockReturnValue({ lte: mockLte });
  mockEq.mockReturnValue({ gte: mockGte });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ select: mockSelect });
});

describe("getExportData — privacy scaffold", () => {
  it("E6: returns only the authenticated user's transactions", async () => {
    const { requireUser } = await import("@/lib/supabase/require-user");
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: mockUserId } as never,
      supabase: { from: mockFrom } as never,
    });

    const { getExportData } = await import("./actions");
    await getExportData({ start: "2026-06-01", end: "2026-06-30" });

    // Verify the user_id filter is applied (defense-in-depth, RLS alone is insufficient)
    expect(mockEq).toHaveBeenCalledWith("user_id", mockUserId);
  });

  it.todo(
    "E7: excludes partner's Personal transactions when scope is personal",
  );
  it.todo("E7: includes partner's Shared transactions when scope is combined");
  it.todo("E7: combined export never includes partner's Personal transactions");
});
