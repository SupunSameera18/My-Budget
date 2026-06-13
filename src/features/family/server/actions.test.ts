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
  updatePrivacyToggle,
  getHidePersonal,
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

// ── Helpers for .from().update/select chain mocks ─────────────────────────────

function makeFromUpdateChain(result: {
  data?: { id: string }[] | null;
  error?: null | { code: string; message: string };
}) {
  const chain = {
    select: vi.fn().mockResolvedValue({
      data: result.data ?? null,
      error: result.error ?? null,
    }),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  };
  // each builder call returns the same chain object
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  return chain;
}

function makeFromSelectChain(result: {
  data?: { hide_personal: boolean } | null;
  error?: null | { code: string; message: string };
}) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: result.data ?? null,
          error: result.error ?? null,
        }),
      }),
    }),
  };
}

function mockAuthWithFrom(fromImpl: (table: string) => unknown) {
  vi.mocked(requireUser).mockResolvedValue({
    supabase: { from: fromImpl } as never,
    user: { id: USER_ID } as never,
  });
}

// ── updatePrivacyToggle ────────────────────────────────────────────────────────

describe("updatePrivacyToggle", () => {
  it("calls requireUser first, then updates family_members.hide_personal", async () => {
    const chain = makeFromUpdateChain({ data: [{ id: "mem-1" }], error: null });
    mockAuthWithFrom(() => chain);

    const result = await updatePrivacyToggle(true);

    expect(vi.mocked(requireUser)).toHaveBeenCalled();
    expect(chain.update).toHaveBeenCalledWith({ hide_personal: true });
    expect(chain.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(result.ok).toBe(true);
  });

  it("returns ok() when update matches a row", async () => {
    const chain = makeFromUpdateChain({ data: [{ id: "mem-1" }], error: null });
    mockAuthWithFrom(() => chain);

    const result = await updatePrivacyToggle(false);

    expect(result.ok).toBe(true);
  });

  it("returns err(NotInFamily) when no row matched (not in family)", async () => {
    const chain = makeFromUpdateChain({ data: [], error: null });
    mockAuthWithFrom(() => chain);

    const result = await updatePrivacyToggle(true);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.NotInFamily);
  });

  it("returns err(PrivacyToggleFailed) on DB error", async () => {
    const chain = makeFromUpdateChain({
      data: null,
      error: { code: "500", message: "db error" },
    });
    mockAuthWithFrom(() => chain);

    const result = await updatePrivacyToggle(true);

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.PrivacyToggleFailed);
  });

  it("returns undefined (redirect) when not authenticated", async () => {
    vi.mocked(requireUser).mockResolvedValue(null);

    const result = await updatePrivacyToggle(true);
    expect(result).toBeUndefined();
  });
});

// ── getHidePersonal ───────────────────────────────────────────────────────────

describe("getHidePersonal", () => {
  it("returns true when family_members row has hide_personal=true", async () => {
    mockAuthWithFrom(() =>
      makeFromSelectChain({ data: { hide_personal: true } }),
    );

    const value = await getHidePersonal();
    expect(value).toBe(true);
  });

  it("returns false when family_members row has hide_personal=false", async () => {
    mockAuthWithFrom(() =>
      makeFromSelectChain({ data: { hide_personal: false } }),
    );

    const value = await getHidePersonal();
    expect(value).toBe(false);
  });

  it("returns false when no family_members row (not in family)", async () => {
    mockAuthWithFrom(() => makeFromSelectChain({ data: null }));

    const value = await getHidePersonal();
    expect(value).toBe(false);
  });

  it("returns false when not authenticated", async () => {
    vi.mocked(requireUser).mockResolvedValue(null);

    const value = await getHidePersonal();
    expect(value).toBe(false);
  });
});
