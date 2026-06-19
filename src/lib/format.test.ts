import { describe, it, expect } from "vitest";
import { formatMoney, currencySymbol } from "./format";

describe("formatMoney", () => {
  it("formats integer minor units with symbol prefix and grouping", () => {
    expect(formatMoney(100000, "USD")).toBe("$1,000.00");
  });

  it("uses Rs prefix for LKR (not the LKR code)", () => {
    expect(formatMoney(100000, "LKR")).toBe("Rs 1,000.00");
  });

  it("handles zero correctly", () => {
    expect(formatMoney(0, "USD")).toBe("$0.00");
  });

  it("handles bigint input", () => {
    expect(formatMoney(BigInt(50000), "USD")).toBe("$500.00");
  });

  it("keeps the sign in front of the symbol for negatives", () => {
    expect(formatMoney(-100000, "USD")).toBe("-$1,000.00");
  });

  it("falls back to the raw code as prefix for an unmapped currency", () => {
    expect(formatMoney(1000, "INVALID_CODE")).toBe("INVALID_CODE 10.00");
  });
});

describe("currencySymbol", () => {
  it("maps known codes to short symbols", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("LKR")).toBe("Rs");
    expect(currencySymbol("INR")).toBe("₹");
  });

  it("falls back to the code for unknown currencies", () => {
    expect(currencySymbol("ZZZ")).toBe("ZZZ");
  });
});
