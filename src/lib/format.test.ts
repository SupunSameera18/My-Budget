import { describe, it, expect } from "vitest";
import { formatMoney } from "./format";

describe("formatMoney", () => {
  it("formats integer minor units as currency string", () => {
    const result = formatMoney(100000, "USD");
    expect(result).toMatch(/1[,.]?000\.00/);
  });

  it("handles zero correctly", () => {
    const result = formatMoney(0, "USD");
    expect(result).toMatch(/0\.00/);
  });

  it("handles bigint input", () => {
    const result = formatMoney(BigInt(50000), "USD");
    expect(result).toMatch(/500\.00/);
  });

  it("handles negative minor units", () => {
    const result = formatMoney(-1000, "USD");
    expect(result).toMatch(/-?.*10\.00/);
  });

  it("returns plain decimal for invalid currency code", () => {
    const result = formatMoney(1000, "INVALID_CODE");
    expect(result).toBe("10.00");
  });
});
