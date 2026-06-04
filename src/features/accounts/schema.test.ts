import { describe, it, expect } from "vitest";
import {
  createAccountSchema,
  updateAccountSchema,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
} from "./schema";

describe("createAccountSchema", () => {
  it("accepts a valid account", () => {
    const result = createAccountSchema.safeParse({
      name: "My Savings",
      type: "savings",
      openingBalance: "1000.00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createAccountSchema.safeParse({
      name: "",
      type: "cash",
      openingBalance: "0",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("name");
  });

  it("rejects name over 50 chars", () => {
    const result = createAccountSchema.safeParse({
      name: "a".repeat(51),
      type: "bank",
      openingBalance: "0",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid type", () => {
    const result = createAccountSchema.safeParse({
      name: "Test",
      type: "credit",
      openingBalance: "0",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("type");
  });

  it("rejects a non-numeric opening balance", () => {
    const result = createAccountSchema.safeParse({
      name: "Test",
      type: "cash",
      openingBalance: "abc",
    });
    expect(result.success).toBe(false);
  });

  it("defaults openingBalance to '0' when omitted", () => {
    const result = createAccountSchema.safeParse({
      name: "Test",
      type: "cash",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.openingBalance).toBe("0");
  });
});

describe("updateAccountSchema", () => {
  it("accepts a valid name and type", () => {
    const result = updateAccountSchema.safeParse({
      name: "My Bank",
      type: "bank",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = updateAccountSchema.safeParse({
      name: "",
      type: "cash",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("name");
  });

  it("rejects name over 50 chars", () => {
    const result = updateAccountSchema.safeParse({
      name: "a".repeat(51),
      type: "savings",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("name");
  });

  it("rejects an invalid type", () => {
    const result = updateAccountSchema.safeParse({
      name: "Valid Name",
      type: "credit",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("type");
  });
});

describe("ACCOUNT_TYPES", () => {
  it("contains exactly cash, bank, savings", () => {
    expect([...ACCOUNT_TYPES].sort()).toEqual(["bank", "cash", "savings"]);
  });
});

describe("ACCOUNT_TYPE_LABELS", () => {
  it("has a label for every type", () => {
    for (const t of ACCOUNT_TYPES) {
      expect(ACCOUNT_TYPE_LABELS[t]).toBeTruthy();
    }
  });
});
