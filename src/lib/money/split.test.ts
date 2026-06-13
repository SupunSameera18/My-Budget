import { describe, expect, it } from "vitest";
import { splitTransaction } from "./split";

describe("splitTransaction — invariant", () => {
  const cases = [
    { amountMinor: 100, method: "equal" as const },
    { amountMinor: 101, method: "equal" as const },
    { amountMinor: 1, method: "equal" as const },
    { amountMinor: 0, method: "equal" as const },
    { amountMinor: 99, method: "equal" as const },
    { amountMinor: 100, method: "percentage" as const, payerPercentage: 60 },
    { amountMinor: 101, method: "percentage" as const, payerPercentage: 50 },
    { amountMinor: 101, method: "percentage" as const, payerPercentage: 60 },
    { amountMinor: 100, method: "percentage" as const, payerPercentage: 0 },
    { amountMinor: 100, method: "percentage" as const, payerPercentage: 100 },
    { amountMinor: 100, method: "fixed" as const, payerFixedMinor: 30 },
    { amountMinor: 100, method: "fixed" as const, payerFixedMinor: 100 },
    { amountMinor: 100, method: "fixed" as const, payerFixedMinor: 0 },
  ];

  cases.forEach((input) => {
    it(`invariant holds for ${JSON.stringify(input)}`, () => {
      const result = splitTransaction(input);
      expect(result.payerShareMinor + result.partnerShareMinor).toBe(
        input.amountMinor,
      );
    });
  });
});

describe("splitTransaction — equal halves", () => {
  it("100 minor units → payerShare=50, partnerShare=50", () => {
    const result = splitTransaction({ amountMinor: 100, method: "equal" });
    expect(result.payerShareMinor).toBe(50);
    expect(result.partnerShareMinor).toBe(50);
  });

  it("101 minor units → payerShare=51, partnerShare=50 (payer gets the extra penny)", () => {
    const result = splitTransaction({ amountMinor: 101, method: "equal" });
    expect(result.payerShareMinor).toBe(51);
    expect(result.partnerShareMinor).toBe(50);
  });

  it("1 minor unit → payerShare=1, partnerShare=0 (minimum)", () => {
    const result = splitTransaction({ amountMinor: 1, method: "equal" });
    expect(result.payerShareMinor).toBe(1);
    expect(result.partnerShareMinor).toBe(0);
  });

  it("0 minor units → payerShare=0, partnerShare=0 (zero edge case)", () => {
    const result = splitTransaction({ amountMinor: 0, method: "equal" });
    expect(result.payerShareMinor).toBe(0);
    expect(result.partnerShareMinor).toBe(0);
  });

  it("99 minor units → payerShare=50, partnerShare=49", () => {
    const result = splitTransaction({ amountMinor: 99, method: "equal" });
    expect(result.payerShareMinor).toBe(50);
    expect(result.partnerShareMinor).toBe(49);
  });
});

describe("splitTransaction — percentage", () => {
  it("100 minor, 60% payer → payerShare=60, partnerShare=40", () => {
    const result = splitTransaction({
      amountMinor: 100,
      method: "percentage",
      payerPercentage: 60,
    });
    expect(result.payerShareMinor).toBe(60);
    expect(result.partnerShareMinor).toBe(40);
  });

  it("101 minor, 50% payer → payerShare=51, partnerShare=50 (remainder to payer on odd)", () => {
    const result = splitTransaction({
      amountMinor: 101,
      method: "percentage",
      payerPercentage: 50,
    });
    expect(result.payerShareMinor).toBe(51);
    expect(result.partnerShareMinor).toBe(50);
  });

  it("101 minor, 60% payer → payerShare=61, partnerShare=40 (60% of 101=60.6 → floor partner=40 → payer=61)", () => {
    const result = splitTransaction({
      amountMinor: 101,
      method: "percentage",
      payerPercentage: 60,
    });
    expect(result.payerShareMinor).toBe(61);
    expect(result.partnerShareMinor).toBe(40);
  });

  it("100 minor, 0% payer → payerShare=0, partnerShare=100 (0% is legal)", () => {
    const result = splitTransaction({
      amountMinor: 100,
      method: "percentage",
      payerPercentage: 0,
    });
    expect(result.payerShareMinor).toBe(0);
    expect(result.partnerShareMinor).toBe(100);
  });

  it("100 minor, 100% payer → payerShare=100, partnerShare=0 (100% is legal)", () => {
    const result = splitTransaction({
      amountMinor: 100,
      method: "percentage",
      payerPercentage: 100,
    });
    expect(result.payerShareMinor).toBe(100);
    expect(result.partnerShareMinor).toBe(0);
  });
});

describe("splitTransaction — fixed", () => {
  it("100 minor, payer fixed=30 → payerShare=30, partnerShare=70", () => {
    const result = splitTransaction({
      amountMinor: 100,
      method: "fixed",
      payerFixedMinor: 30,
    });
    expect(result.payerShareMinor).toBe(30);
    expect(result.partnerShareMinor).toBe(70);
  });

  it("100 minor, payer fixed=100 → payerShare=100, partnerShare=0", () => {
    const result = splitTransaction({
      amountMinor: 100,
      method: "fixed",
      payerFixedMinor: 100,
    });
    expect(result.payerShareMinor).toBe(100);
    expect(result.partnerShareMinor).toBe(0);
  });

  it("100 minor, payer fixed=0 → payerShare=0, partnerShare=100", () => {
    const result = splitTransaction({
      amountMinor: 100,
      method: "fixed",
      payerFixedMinor: 0,
    });
    expect(result.payerShareMinor).toBe(0);
    expect(result.partnerShareMinor).toBe(100);
  });
});
