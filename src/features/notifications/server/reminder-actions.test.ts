import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode } from "@/lib/errors";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/require-user", () => ({ requireUser: vi.fn() }));

import {
  getReminderPreferences,
  saveReminderPreferences,
} from "./reminder-actions";
import { requireUser } from "@/lib/supabase/require-user";
import { redirect } from "next/navigation";
import type { ReminderPreferences } from "@/features/notifications/schema";

const USER_ID = "11111111-9002-4000-8000-000000000099";

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeChain(resolved: { data?: unknown; error?: unknown }): any {
  const chain: any = {
    then: (resolve: any, reject: any) =>
      Promise.resolve({
        data: resolved.data ?? null,
        error: resolved.error ?? null,
      }).then(resolve, reject),
    single: vi.fn().mockResolvedValue({
      data: resolved.data ?? null,
      error: resolved.error ?? null,
    }),
  };
  for (const m of ["select", "eq", "neq", "update", "is", "order", "limit"]) {
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

// ── getReminderPreferences ────────────────────────────────────────────────────

describe("getReminderPreferences", () => {
  it("returns null when unauthenticated", async () => {
    vi.mocked(requireUser).mockResolvedValue(null);
    const result = await getReminderPreferences();
    expect(result).toBeNull();
    expect(vi.mocked(redirect)).not.toHaveBeenCalled();
  });

  it("returns reminder prefs row on success", async () => {
    const row = {
      reminder_enabled: true,
      reminder_time: "20:30",
      reminder_timezone: "Asia/Colombo",
    };
    const chain = makeChain({ data: row });
    mockAuth(chain);

    const result = await getReminderPreferences();
    expect(result).toEqual(row);
  });

  it("returns null on db error (graceful supplementary)", async () => {
    const chain = makeChain({ data: null, error: { message: "db error" } });
    mockAuth(chain);
    const result = await getReminderPreferences();
    expect(result).toBeNull();
  });
});

// ── saveReminderPreferences ───────────────────────────────────────────────────

describe("saveReminderPreferences", () => {
  it("calls requireUser first (§9)", async () => {
    const chain = makeChain({ data: null, error: null });
    mockAuth(chain);
    await saveReminderPreferences({
      reminder_enabled: false,
      reminder_time: null,
      reminder_timezone: null,
    });
    expect(vi.mocked(requireUser)).toHaveBeenCalledOnce();
  });

  it("redirects unauthenticated callers", async () => {
    vi.mocked(requireUser).mockResolvedValue(null);
    await saveReminderPreferences({
      reminder_enabled: false,
      reminder_time: null,
      reminder_timezone: null,
    });
    expect(vi.mocked(redirect)).toHaveBeenCalledWith("/auth/login");
  });

  it("returns err when enabled=true but time is null", async () => {
    const chain = makeChain({ data: null, error: null });
    mockAuth(chain);

    const result = await saveReminderPreferences({
      reminder_enabled: true,
      reminder_time: null,
      reminder_timezone: "UTC",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.ReminderSaveFailed);
  });

  it("returns err when enabled=true but timezone is null", async () => {
    const chain = makeChain({ data: null, error: null });
    mockAuth(chain);

    const result = await saveReminderPreferences({
      reminder_enabled: true,
      reminder_time: "20:30",
      reminder_timezone: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.ReminderSaveFailed);
  });

  it("returns ok when enabled=true with valid time and timezone", async () => {
    const chain = makeChain({ data: null, error: null });
    mockAuth(chain);

    const result = await saveReminderPreferences({
      reminder_enabled: true,
      reminder_time: "20:30",
      reminder_timezone: "Asia/Colombo",
    });
    expect(result.ok).toBe(true);
  });

  it("applies explicit user_id filter on UPDATE (§9 defense-in-depth)", async () => {
    const chain = makeChain({ data: null, error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    vi.mocked(requireUser).mockResolvedValue({
      supabase: supabase as never,
      user: { id: USER_ID } as never,
    });

    await saveReminderPreferences({
      reminder_enabled: false,
      reminder_time: null,
      reminder_timezone: null,
    });

    expect(chain.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("returns err when db UPDATE fails", async () => {
    const chain = makeChain({ data: null, error: { message: "db error" } });
    mockAuth(chain);

    const result = await saveReminderPreferences({
      reminder_enabled: false,
      reminder_time: null,
      reminder_timezone: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(ErrorCode.ReminderSaveFailed);
  });

  it("clears time/timezone in DB when enabled=false regardless of input values", async () => {
    const chain = makeChain({ data: null, error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    vi.mocked(requireUser).mockResolvedValue({
      supabase: supabase as never,
      user: { id: USER_ID } as never,
    });

    const prefs: ReminderPreferences = {
      reminder_enabled: false,
      reminder_time: "20:30",
      reminder_timezone: "UTC",
    };
    await saveReminderPreferences(prefs);

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        reminder_enabled: false,
        reminder_time: null,
        reminder_timezone: null,
      }),
    );
  });
});
