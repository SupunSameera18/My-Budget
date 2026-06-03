import { describe, it, expect, afterEach, vi } from "vitest";

describe("initPostHog", () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  });

  it("is a no-op and does not throw when the key is absent", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const { initPostHog } = await import("./posthog");
    expect(() => initPostHog()).not.toThrow();
  });
});
