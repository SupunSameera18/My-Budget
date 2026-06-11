import { describe, it, expect } from "vitest";
import { computeHealthScore } from "./health-score";

describe("computeHealthScore — golden tests", () => {
  it("1: golden seed — score=89, confidencePercent=74, hasEnoughData=true", () => {
    const r = computeHealthScore({
      budgetAdherenceRate: 0.9,
      cushionRate: 0.2,
      savingsRate: 0.2,
      goalProgressRate: 0.25,
      transactionCount: 30,
    });
    expect(r.score).toBe(89);
    expect(r.confidencePercent).toBe(74);
    expect(r.hasEnoughData).toBe(true);
  });

  it("2: round-half-up at .5 boundary — 88.5 → 89", () => {
    const r = computeHealthScore({
      budgetAdherenceRate: 0.9,
      cushionRate: 0.2,
      savingsRate: 0.2,
      goalProgressRate: 0.25,
      transactionCount: 30,
    });
    expect(r.score).toBe(89);
  });

  it("3: score caps at 100 — all rates at 1.0", () => {
    const r = computeHealthScore({
      budgetAdherenceRate: 1.0,
      cushionRate: 1.0,
      savingsRate: 1.0,
      goalProgressRate: 1.0,
      transactionCount: 30,
    });
    expect(r.score).toBe(100);
  });

  it("4: score floor at 0 — all rates at 0", () => {
    const r = computeHealthScore({
      budgetAdherenceRate: 0,
      cushionRate: 0,
      savingsRate: 0,
      goalProgressRate: 0,
      transactionCount: 30,
    });
    expect(r.score).toBe(0);
  });

  it("5: N/A re-norm — no goals → score=100", () => {
    const r = computeHealthScore({
      budgetAdherenceRate: 1.0,
      cushionRate: 0.2,
      savingsRate: 0.2,
      goalProgressRate: null,
      transactionCount: 30,
    });
    expect(r.score).toBe(100);
  });

  it("6: N/A re-norm — no budgets → score=88", () => {
    const r = computeHealthScore({
      budgetAdherenceRate: null,
      cushionRate: 0.2,
      savingsRate: 0.2,
      goalProgressRate: 0.25,
      transactionCount: 30,
    });
    expect(r.score).toBe(88);
  });

  it("7: N/A re-norm — no income (cushion+savings null) → score=77", () => {
    const r = computeHealthScore({
      budgetAdherenceRate: 0.9,
      cushionRate: null,
      savingsRate: null,
      goalProgressRate: 0.25,
      transactionCount: 30,
    });
    expect(r.score).toBe(77);
  });

  it("8: all N/A — no data at all → score=0", () => {
    const r = computeHealthScore({
      budgetAdherenceRate: null,
      cushionRate: null,
      savingsRate: null,
      goalProgressRate: null,
      transactionCount: 0,
    });
    expect(r.score).toBe(0);
  });

  it("9: confidence at n=0 → confidencePercent=0, hasEnoughData=false", () => {
    const r = computeHealthScore({
      budgetAdherenceRate: 0.9,
      cushionRate: 0.2,
      savingsRate: 0.2,
      goalProgressRate: 0.25,
      transactionCount: 0,
    });
    expect(r.confidencePercent).toBe(0);
    expect(r.hasEnoughData).toBe(false);
  });

  it("10: confidence at n=15 → confidencePercent=37, hasEnoughData=false", () => {
    const r = computeHealthScore({
      budgetAdherenceRate: 0.9,
      cushionRate: 0.2,
      savingsRate: 0.2,
      goalProgressRate: 0.25,
      transactionCount: 15,
    });
    expect(r.confidencePercent).toBe(37);
    expect(r.hasEnoughData).toBe(false);
  });

  it("11: confidence at n=30 → confidencePercent=74, hasEnoughData=true", () => {
    const r = computeHealthScore({
      budgetAdherenceRate: 0.9,
      cushionRate: 0.2,
      savingsRate: 0.2,
      goalProgressRate: 0.25,
      transactionCount: 30,
    });
    expect(r.confidencePercent).toBe(74);
    expect(r.hasEnoughData).toBe(true);
  });

  it("12: confidence capped at n=60 → confidencePercent=74, hasEnoughData=true", () => {
    const r = computeHealthScore({
      budgetAdherenceRate: 0.9,
      cushionRate: 0.2,
      savingsRate: 0.2,
      goalProgressRate: 0.25,
      transactionCount: 60,
    });
    expect(r.confidencePercent).toBe(74);
    expect(r.hasEnoughData).toBe(true);
  });
});
