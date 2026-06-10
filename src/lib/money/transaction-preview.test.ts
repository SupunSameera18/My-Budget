import { describe, it, expect } from "vitest";
import { applyTransactionToBreathingRoom } from "./transaction-preview";

describe("applyTransactionToBreathingRoom — golden tests", () => {
  it("expense subtracts from breathing room", () => {
    expect(applyTransactionToBreathingRoom(5000, 1000, "expense")).toBe(4000);
  });

  it("income adds to breathing room", () => {
    expect(applyTransactionToBreathingRoom(5000, 2000, "income")).toBe(7000);
  });

  it("expense can result in negative breathing room", () => {
    expect(applyTransactionToBreathingRoom(5000, 6000, "expense")).toBe(-1000);
  });

  it("income of 0 is identity (no-op)", () => {
    expect(applyTransactionToBreathingRoom(5000, 0, "income")).toBe(5000);
  });

  it("expense of 0 is identity (no-op)", () => {
    expect(applyTransactionToBreathingRoom(5000, 0, "expense")).toBe(5000);
  });

  it("works with zero current breathing room — income", () => {
    expect(applyTransactionToBreathingRoom(0, 3000, "income")).toBe(3000);
  });

  it("works with zero current breathing room — expense", () => {
    expect(applyTransactionToBreathingRoom(0, 3000, "expense")).toBe(-3000);
  });

  it("works with negative current breathing room — income brings it up", () => {
    expect(applyTransactionToBreathingRoom(-2000, 5000, "income")).toBe(3000);
  });
});
