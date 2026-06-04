import { describe, it, expect } from "vitest";
import {
  createCategorySchema,
  updateCategorySchema,
  createSubcategorySchema,
  updateSubcategorySchema,
  CATEGORY_TYPES,
  CATEGORY_TYPE_LABELS,
} from "./schema";

describe("createCategorySchema", () => {
  it("accepts a valid income category", () => {
    const result = createCategorySchema.safeParse({
      name: "Salary",
      type: "income",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid expense category", () => {
    const result = createCategorySchema.safeParse({
      name: "Groceries",
      type: "expense",
    });
    expect(result.success).toBe(true);
  });

  it("trims whitespace from name", () => {
    const result = createCategorySchema.safeParse({
      name: "  Coffee  ",
      type: "expense",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Coffee");
  });

  it("rejects empty name with path [name]", () => {
    const result = createCategorySchema.safeParse({
      name: "",
      type: "expense",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("name");
  });

  it("rejects name over 50 characters with path [name]", () => {
    const result = createCategorySchema.safeParse({
      name: "a".repeat(51),
      type: "income",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("name");
  });

  it("rejects invalid type with path [type]", () => {
    const result = createCategorySchema.safeParse({
      name: "Transport",
      type: "other",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("type");
  });

  it("rejects missing type with path [type]", () => {
    const result = createCategorySchema.safeParse({ name: "Transport" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("type");
  });
});

describe("updateCategorySchema", () => {
  it("accepts a valid name", () => {
    const result = updateCategorySchema.safeParse({ name: "Rent" });
    expect(result.success).toBe(true);
  });

  it("trims whitespace from name", () => {
    const result = updateCategorySchema.safeParse({ name: "  Rent  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Rent");
  });

  it("rejects empty name with path [name]", () => {
    const result = updateCategorySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("name");
  });

  it("rejects name over 50 characters with path [name]", () => {
    const result = updateCategorySchema.safeParse({ name: "b".repeat(51) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("name");
  });
});

describe("CATEGORY_TYPES", () => {
  it("contains exactly 'income' and 'expense'", () => {
    expect([...CATEGORY_TYPES].sort()).toEqual(["expense", "income"]);
  });
});

describe("CATEGORY_TYPE_LABELS", () => {
  it("has a label for every type in CATEGORY_TYPES", () => {
    for (const t of CATEGORY_TYPES) {
      expect(CATEGORY_TYPE_LABELS[t]).toBeTruthy();
    }
  });

  it("income label is 'Income'", () => {
    expect(CATEGORY_TYPE_LABELS.income).toBe("Income");
  });

  it("expense label is 'Expense'", () => {
    expect(CATEGORY_TYPE_LABELS.expense).toBe("Expense");
  });
});

describe("createSubcategorySchema", () => {
  it("accepts a valid name", () => {
    const result = createSubcategorySchema.safeParse({ name: "Electricity" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name with path [name]", () => {
    const result = createSubcategorySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("name");
  });

  it("rejects name over 50 characters with path [name]", () => {
    const result = createSubcategorySchema.safeParse({ name: "a".repeat(51) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("name");
  });

  it("rejects whitespace-only name (min 1 after trim) with path [name]", () => {
    const result = createSubcategorySchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("name");
  });

  it("does NOT have a type field — ignores unexpected type input", () => {
    const result = createSubcategorySchema.safeParse({
      name: "Electricity",
      type: "expense",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).type).toBeUndefined();
    }
  });

  it("does NOT have a category_id field — ignores unexpected category_id input", () => {
    const result = createSubcategorySchema.safeParse({
      name: "Bills",
      category_id: "some-uuid",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        (result.data as Record<string, unknown>).category_id,
      ).toBeUndefined();
    }
  });
});

describe("updateSubcategorySchema", () => {
  it("accepts a valid name", () => {
    const result = updateSubcategorySchema.safeParse({ name: "Bills" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name with path [name]", () => {
    const result = updateSubcategorySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("name");
  });

  it("rejects name over 50 characters with path [name]", () => {
    const result = updateSubcategorySchema.safeParse({ name: "b".repeat(51) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("name");
  });

  it("does NOT have a type field — ignores unexpected type input", () => {
    const result = updateSubcategorySchema.safeParse({
      name: "Bills",
      type: "income",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).type).toBeUndefined();
    }
  });

  it("does NOT have a category_id field — ignores unexpected category_id input", () => {
    const result = updateSubcategorySchema.safeParse({
      name: "Bills",
      category_id: "some-uuid",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        (result.data as Record<string, unknown>).category_id,
      ).toBeUndefined();
    }
  });
});
