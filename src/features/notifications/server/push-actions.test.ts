import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "@/lib/errors";
import type { PushSubscriptionJSON } from "@/features/notifications/schema";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/require-user", () => ({ requireUser: vi.fn() }));

import { subscribePush, unsubscribePush } from "./push-actions";
import { requireUser } from "@/lib/supabase/require-user";
import { redirect } from "next/navigation";

const USER_ID = "11111111-9006-4000-8000-000000000099";

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
  for (const m of ["select", "eq", "delete", "upsert"]) {
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

const SUBSCRIPTION: PushSubscriptionJSON = {
  endpoint: "https://fcm.example.com/abc123",
  keys: { p256dh: "p256dh-key", auth: "auth-secret" },
};

// ── subscribePush ──────────────────────────────────────────────────────────

describe("subscribePush", () => {
  it("calls requireUser first (§9)", async () => {
    const chain = makeChain({ error: null });
    mockAuth(chain);
    await subscribePush(SUBSCRIPTION);
    expect(vi.mocked(requireUser)).toHaveBeenCalledOnce();
    expect(chain.upsert).toHaveBeenCalled();
  });

  it("redirects unauthenticated callers", async () => {
    vi.mocked(requireUser).mockResolvedValue(null);
    await subscribePush(SUBSCRIPTION);
    expect(vi.mocked(redirect)).toHaveBeenCalledWith("/auth/login");
  });

  it("upserts with ON CONFLICT (user_id, endpoint) ignoreDuplicates", async () => {
    const chain = makeChain({ error: null });
    mockAuth(chain);
    await subscribePush(SUBSCRIPTION);
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        endpoint: SUBSCRIPTION.endpoint,
        p256dh: SUBSCRIPTION.keys.p256dh,
        auth: SUBSCRIPTION.keys.auth,
      }),
      expect.objectContaining({
        onConflict: "user_id,endpoint",
        ignoreDuplicates: false,
      }),
    );
  });

  it("returns ok(undefined) on success", async () => {
    const chain = makeChain({ error: null });
    mockAuth(chain);
    const result = await subscribePush(SUBSCRIPTION);
    expect(result.ok).toBe(true);
  });

  it("returns err(PushSubscribeFailed) on DB error", async () => {
    const chain = makeChain({ error: { message: "boom" } });
    mockAuth(chain);
    const result = await subscribePush(SUBSCRIPTION);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.PushSubscribeFailed);
  });
});

// ── unsubscribePush ────────────────────────────────────────────────────────

describe("unsubscribePush", () => {
  it("calls requireUser first (§9)", async () => {
    const chain = makeChain({ error: null });
    mockAuth(chain);
    await unsubscribePush(SUBSCRIPTION.endpoint);
    expect(vi.mocked(requireUser)).toHaveBeenCalledOnce();
    expect(chain.delete).toHaveBeenCalled();
  });

  it("redirects unauthenticated callers", async () => {
    vi.mocked(requireUser).mockResolvedValue(null);
    await unsubscribePush(SUBSCRIPTION.endpoint);
    expect(vi.mocked(redirect)).toHaveBeenCalledWith("/auth/login");
  });

  it("filters by user_id AND endpoint (defense-in-depth, §9)", async () => {
    const chain = makeChain({ error: null });
    mockAuth(chain);
    await unsubscribePush(SUBSCRIPTION.endpoint);
    expect(chain.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(chain.eq).toHaveBeenCalledWith("endpoint", SUBSCRIPTION.endpoint);
  });

  it("returns ok(undefined) on success", async () => {
    const chain = makeChain({ error: null });
    mockAuth(chain);
    const result = await unsubscribePush(SUBSCRIPTION.endpoint);
    expect(result.ok).toBe(true);
  });

  it("returns err(PushUnsubscribeFailed) on DB error", async () => {
    const chain = makeChain({ error: { message: "boom" } });
    mockAuth(chain);
    const result = await unsubscribePush(SUBSCRIPTION.endpoint);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.PushUnsubscribeFailed);
  });
});
