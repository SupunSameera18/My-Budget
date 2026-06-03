import { describe, it, expect } from "vitest";
import { DEFAULT_CATEGORIES, type CategoryType } from "./seed-defaults";

describe("DEFAULT_CATEGORIES", () => {
  it("is non-empty", () => {
    expect(DEFAULT_CATEGORIES.length).toBeGreaterThan(0);
  });

  it("all entries have a valid type", () => {
    const validTypes: CategoryType[] = ["income", "expense"];
    for (const cat of DEFAULT_CATEGORIES) {
      expect(validTypes).toContain(cat.type);
    }
  });

  it("all entries have a non-empty name", () => {
    for (const cat of DEFAULT_CATEGORIES) {
      expect(cat.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("includes at least one income and one expense category", () => {
    expect(DEFAULT_CATEGORIES.some((c) => c.type === "income")).toBe(true);
    expect(DEFAULT_CATEGORIES.some((c) => c.type === "expense")).toBe(true);
  });

  it("has no duplicate name within the same type", () => {
    for (const type of ["income", "expense"] as CategoryType[]) {
      const names = DEFAULT_CATEGORIES.filter((c) => c.type === type).map(
        (c) => c.name,
      );
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    }
  });
});
