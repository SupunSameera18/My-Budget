import { describe, it, expect } from "vitest";
import { logTransactionSchema } from "./schema";

const baseValid = {
  account_id: "00000000-0000-4000-8000-000000000001",
  category_id: "00000000-0000-4000-8000-000000000002",
  amount_display: "10.00",
  date: "2026-06-03",
};

describe("logTransactionSchema — amount_display", () => {
  it("accepts a whole number amount", () => {
    expect(
      logTransactionSchema.safeParse({ ...baseValid, amount_display: "100" })
        .success,
    ).toBe(true);
  });

  it("accepts a two-decimal amount", () => {
    expect(
      logTransactionSchema.safeParse({ ...baseValid, amount_display: "99.99" })
        .success,
    ).toBe(true);
  });

  it("accepts the minimum valid amount", () => {
    expect(
      logTransactionSchema.safeParse({ ...baseValid, amount_display: "0.01" })
        .success,
    ).toBe(true);
  });

  it("rejects zero", () => {
    expect(
      logTransactionSchema.safeParse({ ...baseValid, amount_display: "0" })
        .success,
    ).toBe(false);
  });

  it("rejects zero with decimals (0.00)", () => {
    expect(
      logTransactionSchema.safeParse({ ...baseValid, amount_display: "0.00" })
        .success,
    ).toBe(false);
  });

  it("rejects more than two decimal places", () => {
    expect(
      logTransactionSchema.safeParse({ ...baseValid, amount_display: "0.001" })
        .success,
    ).toBe(false);
  });

  it("rejects negative amounts", () => {
    expect(
      logTransactionSchema.safeParse({ ...baseValid, amount_display: "-5" })
        .success,
    ).toBe(false);
  });

  it("rejects empty string", () => {
    expect(
      logTransactionSchema.safeParse({ ...baseValid, amount_display: "" })
        .success,
    ).toBe(false);
  });
});

describe("logTransactionSchema — required fields", () => {
  it("rejects missing category_id", () => {
    expect(
      logTransactionSchema.safeParse({
        account_id: baseValid.account_id,
        amount_display: baseValid.amount_display,
        date: baseValid.date,
      }).success,
    ).toBe(false);
  });

  it("rejects missing account_id", () => {
    expect(
      logTransactionSchema.safeParse({
        category_id: baseValid.category_id,
        amount_display: baseValid.amount_display,
        date: baseValid.date,
      }).success,
    ).toBe(false);
  });

  it("accepts optional note", () => {
    expect(
      logTransactionSchema.safeParse({ ...baseValid, note: "Coffee" }).success,
    ).toBe(true);
  });

  it("accepts missing note (optional)", () => {
    expect(logTransactionSchema.safeParse(baseValid).success).toBe(true);
  });

  it("rejects note over 280 chars", () => {
    expect(
      logTransactionSchema.safeParse({
        ...baseValid,
        note: "x".repeat(281),
      }).success,
    ).toBe(false);
  });
});
