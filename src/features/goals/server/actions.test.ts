import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { ErrorCode } from "@/lib/errors";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/require-user", () => ({ requireUser: vi.fn() }));

import { createGoal, contributeToGoal, getGoals } from "./actions";
import { requireUser } from "@/lib/supabase/require-user";

const GOAL_UUID = "aa000000-0001-4000-8000-000000000001";
const USER_ID = "uu000000-0001-4000-8000-000000000001";

function makeRpcSupabase(result: {
  data?: unknown;
  error?: null | { code: string; message: string };
}) {
  const rpc = vi.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  });
  return { rpc };
}

function makeGoalsSupabase(
  opts: {
    goalsData?: unknown[];
    goalsError?: null | { message: string };
    profileData?: { currency: string } | null;
    profileError?: null | { message: string };
  } = {},
) {
  const {
    goalsData = [],
    goalsError = null,
    profileData = { currency: "USD" },
    profileError = null,
  } = opts;

  const goalsChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: goalsData, error: goalsError }),
  };
  const profileChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi
      .fn()
      .mockResolvedValue({ data: profileData, error: profileError }),
  };
  const from = vi
    .fn()
    .mockImplementation((table: string) =>
      table === "goals" ? goalsChain : profileChain,
    );
  return { from };
}

describe("createGoal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok with id on happy path", async () => {
    const supabase = makeRpcSupabase({ data: GOAL_UUID });
    (requireUser as Mock).mockResolvedValue({
      supabase,
      user: { id: USER_ID },
    });

    const fd = new FormData();
    fd.set("name", "Emergency Fund");
    fd.set("target_amount_display", "1000.00");

    const result = await createGoal(fd);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe(GOAL_UUID);
    expect(supabase.rpc).toHaveBeenCalledWith("rpc_create_goal", {
      p_name: "Emergency Fund",
      p_target_minor: 100000,
    });
  });

  it("returns error when requireUser returns null (unauthenticated)", async () => {
    (requireUser as Mock).mockResolvedValue(null);
    const fd = new FormData();
    fd.set("name", "Holiday");
    fd.set("target_amount_display", "500.00");

    const result = await createGoal(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.GoalCreateFailed);
  });

  it("returns validation error for empty name", async () => {
    (requireUser as Mock).mockResolvedValue({
      supabase: makeRpcSupabase({}),
      user: { id: USER_ID },
    });
    const fd = new FormData();
    fd.set("name", "");
    fd.set("target_amount_display", "500.00");

    const result = await createGoal(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.GoalCreateFailed);
      expect(result.error.message).toMatch(/name is required/i);
    }
  });

  it("returns error when target amount rounds to zero", async () => {
    (requireUser as Mock).mockResolvedValue({
      supabase: makeRpcSupabase({}),
      user: { id: USER_ID },
    });
    const fd = new FormData();
    fd.set("name", "Tiny Goal");
    fd.set("target_amount_display", "0.00");

    const result = await createGoal(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.GoalCreateFailed);
  });
});

describe("contributeToGoal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok on happy path", async () => {
    const supabase = makeRpcSupabase({ data: "contrib-uuid" });
    (requireUser as Mock).mockResolvedValue({
      supabase,
      user: { id: USER_ID },
    });

    const fd = new FormData();
    fd.set("goal_id", "aaaaaaaa-0001-4000-8000-000000000001");
    fd.set("amount_display", "50.00");
    fd.set("date", "2026-06-10");

    const result = await contributeToGoal(fd);
    expect(result.ok).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("rpc_contribute_goal", {
      p_goal_id: "aaaaaaaa-0001-4000-8000-000000000001",
      p_amount_minor: 5000,
      p_date: "2026-06-10",
    });
  });

  it("returns 'Goal not found' error when RPC raises P0002", async () => {
    const supabase = makeRpcSupabase({
      error: { code: "P0002", message: "Goal not found or not owned by user" },
    });
    (requireUser as Mock).mockResolvedValue({
      supabase,
      user: { id: USER_ID },
    });

    const fd = new FormData();
    fd.set("goal_id", "aaaaaaaa-0001-4000-8000-000000000001");
    fd.set("amount_display", "25.00");
    fd.set("date", "2026-06-10");

    const result = await contributeToGoal(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.ContributionCreateFailed);
      expect(result.error.message).toBe("Goal not found.");
    }
  });

  it("returns error when requireUser returns null (unauthenticated)", async () => {
    (requireUser as Mock).mockResolvedValue(null);
    const fd = new FormData();
    fd.set("goal_id", "aaaaaaaa-0001-4000-8000-000000000001");
    fd.set("amount_display", "10.00");
    fd.set("date", "2026-06-10");

    const result = await contributeToGoal(fd);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.ContributionCreateFailed);
  });

  it("returns error when amount rounds to zero", async () => {
    (requireUser as Mock).mockResolvedValue({
      supabase: makeRpcSupabase({}),
      user: { id: USER_ID },
    });
    const fd = new FormData();
    fd.set("goal_id", "aaaaaaaa-0001-4000-8000-000000000001");
    fd.set("amount_display", "0.00");
    fd.set("date", "2026-06-10");

    const result = await contributeToGoal(fd);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.ContributionCreateFailed);
  });
});

describe("getGoals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns goals with computed progress on happy path", async () => {
    const supabase = makeGoalsSupabase({
      goalsData: [
        {
          id: GOAL_UUID,
          name: "Emergency Fund",
          target_minor: 500000,
          created_at: "2026-06-01T00:00:00Z",
          goal_contributions: [{ amount_minor: 10000 }, { amount_minor: 5000 }],
        },
      ],
      profileData: { currency: "GBP" },
    });
    (requireUser as Mock).mockResolvedValue({
      supabase,
      user: { id: USER_ID },
    });

    const result = await getGoals();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.currency).toBe("GBP");
      expect(result.data.goals).toHaveLength(1);
      const g = result.data.goals[0];
      expect(g.currentMinor).toBe(15000);
      expect(g.remaining_minor).toBe(485000);
      expect(g.pctUsed).toBeCloseTo(3);
    }
  });

  it("returns empty goals array when user has no goals", async () => {
    const supabase = makeGoalsSupabase({ goalsData: [] });
    (requireUser as Mock).mockResolvedValue({
      supabase,
      user: { id: USER_ID },
    });

    const result = await getGoals();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.goals).toHaveLength(0);
  });

  it("allows pctUsed above 100 (over-contribution not capped)", async () => {
    const supabase = makeGoalsSupabase({
      goalsData: [
        {
          id: GOAL_UUID,
          name: "Holiday",
          target_minor: 10000,
          created_at: "2026-06-01T00:00:00Z",
          goal_contributions: [{ amount_minor: 12000 }],
        },
      ],
    });
    (requireUser as Mock).mockResolvedValue({
      supabase,
      user: { id: USER_ID },
    });

    const result = await getGoals();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.goals[0].pctUsed).toBeGreaterThan(100);
      expect(result.data.goals[0].remaining_minor).toBe(-2000);
    }
  });

  it("returns error when requireUser returns null", async () => {
    (requireUser as Mock).mockResolvedValue(null);
    const result = await getGoals();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.GoalFetchFailed);
  });

  it("returns error when goals DB fetch fails", async () => {
    const supabase = makeGoalsSupabase({
      goalsError: { message: "DB error" },
    });
    (requireUser as Mock).mockResolvedValue({
      supabase,
      user: { id: USER_ID },
    });

    const result = await getGoals();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.GoalFetchFailed);
  });
});
