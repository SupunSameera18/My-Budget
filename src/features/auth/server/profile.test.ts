import { describe, it, expect, vi } from "vitest";
import { createProfile } from "./profile";
import { ErrorCode } from "@/lib/errors";

function makeInsertMock(insertResult: {
  error: null | { message: string; code?: string };
}) {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue(insertResult),
    }),
  } as unknown as Parameters<typeof createProfile>[0];
}

describe("createProfile", () => {
  it("returns ok:true on successful insert", async () => {
    const supabase = makeInsertMock({ error: null });
    const result = await createProfile(supabase, "user-uuid-123");

    expect(result.ok).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith("profiles");
    const insertFn = (supabase.from as ReturnType<typeof vi.fn>).mock.results[0]
      .value.insert;
    expect(insertFn).toHaveBeenCalledWith({ user_id: "user-uuid-123" });
  });

  it("returns ok:false with AppError on DB failure", async () => {
    expect.assertions(3);
    const supabase = makeInsertMock({
      error: { message: "duplicate key value", code: "23505" },
    });
    const result = await createProfile(supabase, "user-uuid-456");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.ProfileCreateFailed);
      expect(result.error.message).toContain("duplicate key value");
    }
  });
});
