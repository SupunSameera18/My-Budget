import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { ErrorCode } from "@/lib/errors";
import { revalidatePath } from "next/cache";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_noStore: vi.fn(),
}));
vi.mock("@/lib/supabase/require-user", () => ({ requireUser: vi.fn() }));

import {
  createGoal,
  contributeToGoal,
  getGoals,
  editGoalTarget,
} from "./actions";
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
    memberData?: { join_date: string } | null;
  } = {},
) {
  const {
    goalsData = [],
    goalsError = null,
    profileData = { currency: "USD" },
    profileError = null,
    memberData = null,
  } = opts;

  // Flat chain factory — resolves regardless of method call order (dev-learnings §27)
  function makeChain(resolved: { data: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {
      then: (resolve: unknown, reject: unknown) =>
        Promise.resolve(resolved).then(
          resolve as (v: unknown) => unknown,
          reject as (v: unknown) => unknown,
        ),
      single: vi.fn().mockResolvedValue(resolved),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: resolved.data, error: null }),
    };
    for (const m of [
      "select",
      "eq",
      "is",
      "order",
      "neq",
      "not",
      "gte",
      "lte",
    ]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    return chain;
  }

  const goalsChain = makeChain({ data: goalsData, error: goalsError });
  const profileChain = makeChain({ data: profileData, error: profileError });
  const memberChain = makeChain({ data: memberData, error: null });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "goals") return goalsChain;
    if (table === "family_members") return memberChain;
    return profileChain;
  });
  return { from };
}

describe("createGoal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok with id on happy path (personal goal)", async () => {
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
      p_is_shared: false,
    });
  });

  it("passes p_is_shared=true when is_shared=true in form data", async () => {
    const supabase = makeRpcSupabase({ data: GOAL_UUID });
    (requireUser as Mock).mockResolvedValue({
      supabase,
      user: { id: USER_ID },
    });

    const fd = new FormData();
    fd.set("name", "Holiday Fund");
    fd.set("target_amount_display", "500.00");
    fd.set("is_shared", "true");

    const result = await createGoal(fd);
    expect(result.ok).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("rpc_create_goal", {
      p_name: "Holiday Fund",
      p_target_minor: 50000,
      p_is_shared: true,
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

  it("returns goals with computed progress for solo user", async () => {
    const supabase = makeGoalsSupabase({
      goalsData: [
        {
          id: GOAL_UUID,
          user_id: USER_ID,
          name: "Emergency Fund",
          target_minor: 500000,
          is_shared: false,
          created_at: "2026-06-01T00:00:00Z",
          goal_contributions: [
            { amount_minor: 10000, date: "2026-06-01", user_id: USER_ID },
            { amount_minor: 5000, date: "2026-06-02", user_id: USER_ID },
          ],
        },
      ],
      profileData: { currency: "GBP" },
      memberData: null,
    });
    (requireUser as Mock).mockResolvedValue({
      supabase,
      user: { id: USER_ID },
    });

    const result = await getGoals();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.currency).toBe("GBP");
      expect(result.data.isFamilyMode).toBe(false);
      expect(result.data.goals).toHaveLength(1);
      const g = result.data.goals[0];
      expect(g.currentMinor).toBe(15000);
      expect(g.is_shared).toBe(false);
      expect(g.isOwner).toBe(true);
    }
  });

  it("filters shared goal progress to post-join contributions for viewer in family mode", async () => {
    const PARTNER_ID = "pp000000-0001-4000-8000-000000000001";
    const supabase = makeGoalsSupabase({
      goalsData: [
        {
          id: GOAL_UUID,
          user_id: USER_ID,
          name: "Holiday Fund",
          target_minor: 100000,
          is_shared: true,
          created_at: "2026-06-01T00:00:00Z",
          goal_contributions: [
            // pre-join contribution (alice, before bob join_date 2026-06-05)
            { amount_minor: 20000, date: "2026-06-01", user_id: USER_ID },
            // post-join contributions
            { amount_minor: 8000, date: "2026-06-06", user_id: USER_ID },
            { amount_minor: 5000, date: "2026-06-07", user_id: PARTNER_ID },
          ],
        },
      ],
      profileData: { currency: "USD" },
      memberData: { join_date: "2026-06-05" },
    });
    (requireUser as Mock).mockResolvedValue({
      supabase,
      user: { id: USER_ID },
    });

    const result = await getGoals();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.isFamilyMode).toBe(true);
      const g = result.data.goals[0];
      // pooled = post-join only: 8000 + 5000 = 13000 (pre-join 20000 excluded)
      expect(g.currentMinor).toBe(13000);
      expect(g.myContributionMinor).toBe(8000);
      expect(g.partnerContributionMinor).toBe(5000);
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
          user_id: USER_ID,
          name: "Holiday",
          target_minor: 10000,
          is_shared: false,
          created_at: "2026-06-01T00:00:00Z",
          goal_contributions: [
            { amount_minor: 12000, date: "2026-06-01", user_id: USER_ID },
          ],
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

describe("editGoalTarget", () => {
  function makeUpdateSupabase(
    opts: { data?: unknown[] | null; error?: null | { message: string } } = {},
  ) {
    const { data = [{ id: GOAL_UUID }], error = null } = opts;
    const chain: Record<string, unknown> = {};
    chain.update = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.is = vi.fn().mockReturnValue(chain);
    chain.select = vi.fn().mockResolvedValue({ data, error });
    return { from: vi.fn().mockReturnValue(chain), chain };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok on happy path and calls revalidatePath('/goals')", async () => {
    const { from, chain } = makeUpdateSupabase();
    (requireUser as Mock).mockResolvedValue({
      supabase: { from },
      user: { id: USER_ID },
    });

    const fd = new FormData();
    fd.set("goal_id", GOAL_UUID);
    fd.set("target_amount_display", "2000.00");

    const result = await editGoalTarget(fd);
    expect(result.ok).toBe(true);
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ target_minor: 200000 }),
    );
    expect(chain.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(revalidatePath).toHaveBeenCalledWith("/goals");
  });

  it("returns GoalUpdateFailed error when requireUser returns null", async () => {
    (requireUser as Mock).mockResolvedValue(null);

    const fd = new FormData();
    fd.set("goal_id", GOAL_UUID);
    fd.set("target_amount_display", "500.00");

    const result = await editGoalTarget(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.GoalUpdateFailed);
  });

  it("returns GoalUpdateFailed when target amount rounds to zero", async () => {
    (requireUser as Mock).mockResolvedValue({
      supabase: makeUpdateSupabase(),
      user: { id: USER_ID },
    });

    const fd = new FormData();
    fd.set("goal_id", GOAL_UUID);
    fd.set("target_amount_display", "0.00");

    const result = await editGoalTarget(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.GoalUpdateFailed);
  });

  it("returns GoalUpdateFailed when goal is not found (0 rows updated)", async () => {
    const { from } = makeUpdateSupabase({ data: [] });
    (requireUser as Mock).mockResolvedValue({
      supabase: { from },
      user: { id: USER_ID },
    });

    const fd = new FormData();
    fd.set("goal_id", GOAL_UUID);
    fd.set("target_amount_display", "1000.00");

    const result = await editGoalTarget(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.GoalUpdateFailed);
      expect(result.error.message).toMatch(/not found/i);
    }
  });

  it("returns GoalUpdateFailed when DB update fails", async () => {
    const { from } = makeUpdateSupabase({ error: { message: "DB error" } });
    (requireUser as Mock).mockResolvedValue({
      supabase: { from },
      user: { id: USER_ID },
    });

    const fd = new FormData();
    fd.set("goal_id", GOAL_UUID);
    fd.set("target_amount_display", "750.00");

    const result = await editGoalTarget(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.GoalUpdateFailed);
  });
});
