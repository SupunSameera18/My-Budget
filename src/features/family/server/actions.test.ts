import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "@/lib/errors";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("node:crypto", () => ({
  randomBytes: vi.fn(() => Buffer.from("a".repeat(32))),
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => "deadbeef".repeat(8)),
  })),
}));

// Mock global fetch for PostHog (non-fatal)
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

import {
  generateInviteCode,
  revokeInviteCode,
  getInvitePreview,
  redeemInviteCode,
  getFamilyStatus,
  getContributionAnalysis,
  getSettleTally,
  markSettled,
} from "./actions";
import { requireUser } from "@/lib/supabase/require-user";

const USER_ID = "ffffffff-ffff-4fff-8fff-000000000099";

function makeRpc(result: {
  data?: unknown;
  error?: null | { code: string; message: string };
}) {
  return vi.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  });
}

function mockAuth(rpcResult?: {
  data?: unknown;
  error?: null | { code: string; message: string };
}) {
  const rpc = makeRpc(rpcResult ?? { data: null, error: null });
  vi.mocked(requireUser).mockResolvedValue({
    supabase: { rpc } as never,
    user: { id: USER_ID } as never,
  });
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── generateInviteCode ────────────────────────────────────────────────────────

describe("generateInviteCode", () => {
  it("calls requireUser first, then rpc_generate_invite, returns raw code", async () => {
    const rpc = mockAuth({ data: null, error: null });

    const result = await generateInviteCode();

    expect(vi.mocked(requireUser)).toHaveBeenCalledBefore?.(rpc as never);
    expect(rpc).toHaveBeenCalledWith(
      "rpc_generate_invite",
      expect.objectContaining({
        p_code_hash: expect.any(String),
        p_expires_at: expect.any(String),
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.code).toBeTruthy();
  });

  it("returns err(InviteGenerateFailed) when RPC errors", async () => {
    mockAuth({ data: null, error: { code: "500", message: "db error" } });

    const result = await generateInviteCode();

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.InviteGenerateFailed);
  });

  it("returns null (redirect) when not authenticated", async () => {
    vi.mocked(requireUser).mockResolvedValue(null);

    // redirect() from next/navigation is mocked; the function returns undefined
    const result = await generateInviteCode();
    expect(result).toBeUndefined();
  });
});

// ── revokeInviteCode ──────────────────────────────────────────────────────────

describe("revokeInviteCode", () => {
  it("calls requireUser first, then rpc_revoke_invite", async () => {
    const rpc = mockAuth({ data: null, error: null });

    const result = await revokeInviteCode("some-invite-id");

    expect(rpc).toHaveBeenCalledWith("rpc_revoke_invite", {
      p_invite_id: "some-invite-id",
    });
    expect(result.ok).toBe(true);
  });

  it("returns err(InviteRevokeFailed) when RPC errors", async () => {
    mockAuth({ data: null, error: { code: "P0002", message: "not found" } });

    const result = await revokeInviteCode("bad-id");

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.InviteRevokeFailed);
  });
});

// ── getInvitePreview ──────────────────────────────────────────────────────────

describe("getInvitePreview", () => {
  it("returns creatorName when RPC returns an email", async () => {
    mockAuth({ data: "alice@test.local", error: null });

    const result = await getInvitePreview("rawcode");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.creatorName).toBe("alice@test.local");
  });

  it("returns err(InviteNotFound) when RPC returns null", async () => {
    mockAuth({ data: null, error: null });

    const result = await getInvitePreview("badcode");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.InviteNotFound);
  });

  it("returns err(InviteNotFound) when RPC errors", async () => {
    mockAuth({ data: null, error: { code: "42501", message: "denied" } });

    const result = await getInvitePreview("badcode");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.InviteNotFound);
  });
});

// ── redeemInviteCode ──────────────────────────────────────────────────────────

describe("redeemInviteCode", () => {
  it("returns ok() on success", async () => {
    mockAuth({ data: null, error: null });

    const result = await redeemInviteCode("validcode");

    expect(result.ok).toBe(true);
  });

  it("branches on P0002 → InviteNotFound", async () => {
    mockAuth({ data: null, error: { code: "P0002", message: "not found" } });

    const result = await redeemInviteCode("badcode");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.InviteNotFound);
  });

  it("branches on P0003 → InviteRateLimitExceeded", async () => {
    mockAuth({ data: null, error: { code: "P0003", message: "rate limit" } });

    const result = await redeemInviteCode("anycode");

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.InviteRateLimitExceeded);
  });

  it("branches on 23514 → FamilyFull", async () => {
    mockAuth({ data: null, error: { code: "23514", message: "trigger" } });

    const result = await redeemInviteCode("anycode");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.FamilyFull);
  });

  it("branches on P0001 → InviteOwnCode", async () => {
    mockAuth({ data: null, error: { code: "P0001", message: "own invite" } });

    const result = await redeemInviteCode("owncode");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.InviteOwnCode);
  });

  it("branches on P0004 → AlreadyInFamily", async () => {
    mockAuth({
      data: null,
      error: { code: "P0004", message: "already in a family" },
    });

    const result = await redeemInviteCode("anycode");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.AlreadyInFamily);
  });
});

// ── getFamilyStatus ───────────────────────────────────────────────────────────

describe("getFamilyStatus", () => {
  it("returns solo when not authenticated", async () => {
    vi.mocked(requireUser).mockResolvedValue(null);

    const status = await getFamilyStatus();
    expect(status.status).toBe("solo");
  });

  it("returns solo when RPC returns solo", async () => {
    mockAuth({ data: { status: "solo" }, error: null });

    const status = await getFamilyStatus();
    expect(status.status).toBe("solo");
  });

  it("returns has_invite when RPC returns has_invite", async () => {
    mockAuth({
      data: {
        status: "has_invite",
        family_unit_id: "unit-1",
        invite_id: "inv-1",
        invite_expires_at: "2026-06-19T00:00:00Z",
        invite_created_at: "2026-06-12T00:00:00Z",
      },
      error: null,
    });

    const status = await getFamilyStatus();
    expect(status.status).toBe("has_invite");
    if (status.status === "has_invite") {
      expect(status.invite.id).toBe("inv-1");
    }
  });

  it("returns in_family when RPC returns in_family", async () => {
    mockAuth({
      data: {
        status: "in_family",
        family_unit_id: "unit-1",
        partner_name: "Bob",
      },
      error: null,
    });

    const status = await getFamilyStatus();
    expect(status.status).toBe("in_family");
    if (status.status === "in_family") {
      expect(status.partner.displayName).toBe("Bob");
    }
  });
});

// ── getContributionAnalysis ───────────────────────────────────────────────────

const ALICE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB_ID = "bbbbbbbb-0000-4000-8000-000000000002";

const RPC_ROWS = [
  {
    contributor_id: ALICE_ID,
    total_paid_minor: 500,
    transaction_count: 2,
    goal_contribution_minor: 100,
  },
  {
    contributor_id: BOB_ID,
    total_paid_minor: 300,
    transaction_count: 2,
    goal_contribution_minor: 0,
  },
];

function makeContributionAuth(
  rpcRows: unknown[] | null,
  rpcError?: { code: string; message: string } | null,
) {
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: rpcRows, error: rpcError ?? null });

  // profiles query chain: .from("profiles").select(...).in(...) → array
  // callerProfile query chain: .from("profiles").select("currency").eq(...).single() → single
  const inChain = {
    then: (r: (v: unknown) => unknown) =>
      Promise.resolve({
        data: [
          { user_id: ALICE_ID, display_name: "Alice" },
          { user_id: BOB_ID, display_name: "Bob" },
        ],
        error: null,
      }).then(r),
  };
  const singleChain = {
    single: vi
      .fn()
      .mockResolvedValue({ data: { currency: "USD" }, error: null }),
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const fromImpl = (_table: string) => ({
    select: vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue(inChain),
      eq: vi.fn().mockReturnValue(singleChain),
    }),
  });

  vi.mocked(requireUser).mockResolvedValue({
    supabase: { rpc, from: fromImpl } as never,
    user: { id: ALICE_ID } as never,
  });

  return rpc;
}

describe("getContributionAnalysis", () => {
  it("returns null when not authenticated", async () => {
    vi.mocked(requireUser).mockResolvedValue(null);
    const result = await getContributionAnalysis();
    expect(result).toBeNull();
  });

  it("returns null when RPC errors", async () => {
    makeContributionAuth(null, { code: "500", message: "db error" });
    const result = await getContributionAnalysis();
    expect(result).toBeNull();
  });

  it("returns null when RPC returns 0 rows (solo user)", async () => {
    makeContributionAuth([]);
    const result = await getContributionAnalysis();
    expect(result).toBeNull();
  });

  it("returns ContributionAnalysisData with caller first when RPC returns 2 rows", async () => {
    makeContributionAuth(RPC_ROWS);
    const result = await getContributionAnalysis();
    expect(result).not.toBeNull();
    expect(result!.contributions).toHaveLength(2);
    // Caller (ALICE_ID) should be first
    expect(result!.contributions[0].contributorId).toBe(ALICE_ID);
    expect(result!.contributions[0].displayName).toBe("Alice");
    expect(result!.contributions[0].totalPaidMinor).toBe(500);
    expect(result!.contributions[0].goalContributionMinor).toBe(100);
  });

  it("passes period params to RPC", async () => {
    const rpc = makeContributionAuth(RPC_ROWS);
    await getContributionAnalysis("2026-06-01", "2026-06-30");
    expect(rpc).toHaveBeenCalledWith("rpc_get_contribution_analysis", {
      p_period_start: "2026-06-01",
      p_period_end: "2026-06-30",
    });
  });

  it("calls requireUser before any other async operation", async () => {
    makeContributionAuth(RPC_ROWS);
    await getContributionAnalysis();
    expect(vi.mocked(requireUser)).toHaveBeenCalled();
  });
});

// ── getSettleTally ────────────────────────────────────────────────────────────

const FAMILY_UNIT_ID = "aaaabbbb-0000-4000-8000-000000000001";

describe("getSettleTally", () => {
  it("returns null when not authenticated (graceful supplementary)", async () => {
    vi.mocked(requireUser).mockResolvedValue(null);
    const result = await getSettleTally(FAMILY_UNIT_ID);
    expect(result).toBeNull();
  });

  it("returns null when rpc_settle_up returns an error", async () => {
    mockAuth({ data: null, error: { code: "500", message: "db error" } });
    const result = await getSettleTally(FAMILY_UNIT_ID);
    expect(result).toBeNull();
  });

  it("returns the tally number on success", async () => {
    mockAuth({ data: 5000, error: null });
    const result = await getSettleTally(FAMILY_UNIT_ID);
    expect(result).toBe(5000);
  });

  it("returns 0 when tally is zero (all settled)", async () => {
    mockAuth({ data: 0, error: null });
    const result = await getSettleTally(FAMILY_UNIT_ID);
    expect(result).toBe(0);
  });
});

// ── markSettled ───────────────────────────────────────────────────────────────

describe("markSettled", () => {
  it("calls requireUser first", async () => {
    mockAuth({ data: "uuid-settlement-id", error: null });
    await markSettled(FAMILY_UNIT_ID);
    expect(vi.mocked(requireUser)).toHaveBeenCalled();
  });

  it("returns ok with settlementId on success", async () => {
    mockAuth({ data: "settlement-uuid-123", error: null });
    const result = await markSettled(FAMILY_UNIT_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.settlementId).toBe("settlement-uuid-123");
  });

  it("returns SettleUpFailed on RPC error", async () => {
    mockAuth({ data: null, error: { code: "42501", message: "not a member" } });
    const result = await markSettled(FAMILY_UNIT_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.SettleUpFailed);
  });
});
