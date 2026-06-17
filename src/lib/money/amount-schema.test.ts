import { describe, it, expect } from "vitest";
import { moneyDisplaySchema, MAX_DISPLAY_AMOUNT } from "./amount-schema";

describe("moneyDisplaySchema", () => {
  // --- Valid amounts ---
  it("accepts a whole number", () => {
    expect(moneyDisplaySchema.safeParse("50").success).toBe(true);
  });

  it("accepts a decimal with two places", () => {
    expect(moneyDisplaySchema.safeParse("50.00").success).toBe(true);
  });

  it("accepts a decimal with one place", () => {
    expect(moneyDisplaySchema.safeParse("50.5").success).toBe(true);
  });

  it("accepts the string '0' (zero allowed — callers add > 0 refine when needed)", () => {
    expect(moneyDisplaySchema.safeParse("0").success).toBe(true);
  });

  it("accepts large valid amount just under the max", () => {
    expect(moneyDisplaySchema.safeParse("9999999.99").success).toBe(true);
  });

  it("trims leading/trailing whitespace before validating", () => {
    expect(moneyDisplaySchema.safeParse("  50.00  ").success).toBe(true);
  });

  // --- Scientific notation rejection ---
  it("rejects scientific notation (1e5)", () => {
    expect(moneyDisplaySchema.safeParse("1e5").success).toBe(false);
  });

  it("rejects scientific notation (1E5)", () => {
    expect(moneyDisplaySchema.safeParse("1E5").success).toBe(false);
  });

  it("rejects scientific notation (1.5e3)", () => {
    expect(moneyDisplaySchema.safeParse("1.5e3").success).toBe(false);
  });

  // --- Upper bound enforcement ---
  it(`rejects amount equal to ${MAX_DISPLAY_AMOUNT} + 0.01 (over the max)`, () => {
    const overMax = (MAX_DISPLAY_AMOUNT + 0.01).toFixed(2);
    expect(moneyDisplaySchema.safeParse(overMax).success).toBe(false);
  });

  it(`accepts amount equal to ${MAX_DISPLAY_AMOUNT}.00 exactly (at the boundary)`, () => {
    expect(
      moneyDisplaySchema.safeParse(`${MAX_DISPLAY_AMOUNT}.00`).success,
    ).toBe(true);
  });

  it("rejects a clearly excessive amount (99999999.99)", () => {
    expect(moneyDisplaySchema.safeParse("99999999.99").success).toBe(false);
  });

  // --- Format rejections ---
  it("rejects negative amounts (-10)", () => {
    expect(moneyDisplaySchema.safeParse("-10").success).toBe(false);
  });

  it("rejects non-numeric strings (abc)", () => {
    expect(moneyDisplaySchema.safeParse("abc").success).toBe(false);
  });

  it("rejects trailing decimal without digits (50.)", () => {
    expect(moneyDisplaySchema.safeParse("50.").success).toBe(false);
  });

  it("rejects more than 2 decimal places (50.123)", () => {
    expect(moneyDisplaySchema.safeParse("50.123").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(moneyDisplaySchema.safeParse("").success).toBe(false);
  });
});
