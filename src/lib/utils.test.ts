import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

// Smoke test proving the Vitest + path-alias (@/) harness is wired end-to-end.
describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });

  it("merges conflicting tailwind classes (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
