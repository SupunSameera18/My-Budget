import { describe, it, expect } from "vitest";
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_CODES,
  currencyStepSchema,
} from "./schema";

describe("SUPPORTED_CURRENCIES", () => {
  it("contains at least 20 entries", () => {
    expect(SUPPORTED_CURRENCIES.length).toBeGreaterThanOrEqual(20);
  });

  it("every entry has a 3-letter ISO 4217 code", () => {
    for (const { code } of SUPPORTED_CURRENCIES) {
      expect(code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("contains USD, EUR, GBP, LKR", () => {
    const codes = SUPPORTED_CURRENCIES.map((c) => c.code);
    expect(codes).toContain("USD");
    expect(codes).toContain("EUR");
    expect(codes).toContain("GBP");
    expect(codes).toContain("LKR");
  });

  it("has no duplicate codes", () => {
    const codes = SUPPORTED_CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("CURRENCY_CODES", () => {
  it("is a non-empty array of strings", () => {
    expect(Array.isArray(CURRENCY_CODES)).toBe(true);
    expect(CURRENCY_CODES.length).toBeGreaterThan(0);
  });

  it("matches SUPPORTED_CURRENCIES codes", () => {
    const expectedCodes = SUPPORTED_CURRENCIES.map((c) => c.code);
    expect(CURRENCY_CODES).toEqual(expectedCodes);
  });
});

describe("currencyStepSchema", () => {
  it("accepts a supported currency code", () => {
    const result = currencyStepSchema.safeParse({ currency: "USD" });
    expect(result.success).toBe(true);
  });

  it("accepts LKR", () => {
    const result = currencyStepSchema.safeParse({ currency: "LKR" });
    expect(result.success).toBe(true);
  });

  it("rejects an unsupported currency code", () => {
    const result = currencyStepSchema.safeParse({ currency: "XYZ" });
    expect(result.success).toBe(false);
  });

  it("rejects a lowercase code", () => {
    const result = currencyStepSchema.safeParse({ currency: "usd" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = currencyStepSchema.safeParse({ currency: "" });
    expect(result.success).toBe(false);
  });
});
