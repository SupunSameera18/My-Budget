import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "@/lib/errors";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/require-user", () => ({ requireUser: vi.fn() }));

import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  getUnreadNotificationCount,
} from "./actions";
import { requireUser } from "@/lib/supabase/require-user";
import { redirect } from "next/navigation";

const USER_ID = "11111111-9001-4000-8000-000000000099";
const NOTIF_ID = "22222222-9001-4000-8000-000000000001";

// Flat thenable chain — every method returns itself; chain resolves as a Promise
/* eslint-disable @typescript-eslint/no-explicit-any */
function makeChain(resolved: {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}): any {
  const chain: any = {
    then: (resolve: any, reject: any) =>
      Promise.resolve({
        data: resolved.data ?? null,
        error: resolved.error ?? null,
        count: resolved.count ?? null,
      }).then(resolve, reject),
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
    "update",
    "in",
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  return chain;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function mockAuth(chain: ReturnType<typeof makeChain>) {
  vi.mocked(requireUser).mockResolvedValue({
    supabase: { from: vi.fn().mockReturnValue(chain) } as never,
    user: { id: USER_ID } as never,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── getNotifications ──────────────────────────────────────────────────────────

describe("getNotifications", () => {
  it("calls requireUser first (§9)", async () => {
    const chain = makeChain({ data: [] });
    mockAuth(chain);
    await getNotifications();
    expect(vi.mocked(requireUser)).toHaveBeenCalledOnce();
    expect(chain.select).toHaveBeenCalled();
  });

  it("redirects unauthenticated callers", async () => {
    vi.mocked(requireUser).mockResolvedValue(null);
    await getNotifications();
    expect(vi.mocked(redirect)).toHaveBeenCalledWith("/auth/login");
  });

  it("returns ok([]) when no notifications exist", async () => {
    const chain = makeChain({ data: [] });
    mockAuth(chain);
    const result = await getNotifications();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual([]);
  });

  it("returns ok(notifications) when data returned", async () => {
    const notif = {
      id: NOTIF_ID,
      type: "budget_threshold",
      title: "Alert",
      body: "80% used",
      link: null,
      metadata: {},
      read_at: null,
      dismissed_at: null,
      created_at: "2026-06-16T00:00:00Z",
    };
    const chain = makeChain({ data: [notif] });
    mockAuth(chain);
    const result = await getNotifications();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(1);
  });

  it("returns err(NotificationsFetchFailed) on DB error", async () => {
    const chain = makeChain({ data: null, error: { message: "db error" } });
    mockAuth(chain);
    const result = await getNotifications();
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.NotificationsFetchFailed);
  });
});

// ── markNotificationRead ──────────────────────────────────────────────────────

describe("markNotificationRead", () => {
  it("calls requireUser first (§9)", async () => {
    const chain = makeChain({ data: [{ id: NOTIF_ID }], error: null });
    mockAuth(chain);
    await markNotificationRead(NOTIF_ID);
    expect(vi.mocked(requireUser)).toHaveBeenCalledOnce();
  });

  it("redirects unauthenticated callers", async () => {
    vi.mocked(requireUser).mockResolvedValue(null);
    await markNotificationRead(NOTIF_ID);
    expect(vi.mocked(redirect)).toHaveBeenCalledWith("/auth/login");
  });

  it("returns err(NotificationUpdateFailed) for invalid UUID", async () => {
    const chain = makeChain({ error: null });
    mockAuth(chain);
    const result = await markNotificationRead("not-a-uuid");
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.NotificationUpdateFailed);
  });

  it("applies explicit user_id filter (§9 defense-in-depth)", async () => {
    const chain = makeChain({ data: [{ id: NOTIF_ID }], error: null });
    mockAuth(chain);
    await markNotificationRead(NOTIF_ID);
    expect(chain.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("returns ok(undefined) on success", async () => {
    const chain = makeChain({ data: [{ id: NOTIF_ID }], error: null });
    mockAuth(chain);
    const result = await markNotificationRead(NOTIF_ID);
    expect(result.ok).toBe(true);
  });

  it("returns err(NotificationUpdateFailed) when 0 rows updated (already read / not found)", async () => {
    const chain = makeChain({ data: [], error: null });
    mockAuth(chain);
    const result = await markNotificationRead(NOTIF_ID);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.NotificationUpdateFailed);
  });

  it("returns err(NotificationUpdateFailed) on DB error", async () => {
    const chain = makeChain({ error: { message: "db error" } });
    mockAuth(chain);
    const result = await markNotificationRead(NOTIF_ID);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.NotificationUpdateFailed);
  });
});

// ── markAllNotificationsRead ──────────────────────────────────────────────────

describe("markAllNotificationsRead", () => {
  it("calls requireUser first and bulk-updates user's unread notifications", async () => {
    const chain = makeChain({ error: null });
    mockAuth(chain);
    await markAllNotificationsRead();
    expect(vi.mocked(requireUser)).toHaveBeenCalledOnce();
    expect(chain.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("returns ok(undefined) on success", async () => {
    const chain = makeChain({ error: null });
    mockAuth(chain);
    const result = await markAllNotificationsRead();
    expect(result.ok).toBe(true);
  });

  it("returns err(NotificationUpdateFailed) on DB error", async () => {
    const chain = makeChain({ error: { message: "bulk update failed" } });
    mockAuth(chain);
    const result = await markAllNotificationsRead();
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.NotificationUpdateFailed);
  });
});

// ── dismissNotification ───────────────────────────────────────────────────────

describe("dismissNotification", () => {
  it("applies explicit user_id filter and sets dismissed_at + read_at", async () => {
    const chain = makeChain({ error: null });
    mockAuth(chain);
    await dismissNotification(NOTIF_ID);
    expect(chain.eq).toHaveBeenCalledWith("id", NOTIF_ID);
    expect(chain.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("returns ok(undefined) on success", async () => {
    const chain = makeChain({ error: null });
    mockAuth(chain);
    const result = await dismissNotification(NOTIF_ID);
    expect(result.ok).toBe(true);
  });

  it("returns err(NotificationUpdateFailed) for invalid UUID", async () => {
    const chain = makeChain({ error: null });
    mockAuth(chain);
    const result = await dismissNotification("bad-uuid");
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.NotificationUpdateFailed);
  });
});

// ── getUnreadNotificationCount ────────────────────────────────────────────────

describe("getUnreadNotificationCount", () => {
  it("returns 0 when unauthenticated (graceful supplementary)", async () => {
    vi.mocked(requireUser).mockResolvedValue(null);
    const count = await getUnreadNotificationCount();
    expect(count).toBe(0);
  });

  it("returns the count from DB on success", async () => {
    const chain = makeChain({ count: 3 });
    mockAuth(chain);
    const count = await getUnreadNotificationCount();
    expect(count).toBe(3);
  });

  it("returns 0 on DB error (graceful supplementary)", async () => {
    const chain = makeChain({ count: null, error: { message: "db error" } });
    mockAuth(chain);
    const count = await getUnreadNotificationCount();
    expect(count).toBe(0);
  });
});
