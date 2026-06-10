import { describe, it, expect } from "vitest";
import { computeBreathingRoom } from "./breathing-room";

describe("computeBreathingRoom — golden tests", () => {
  it("zero income, zero expense, no budgets → 0", () => {
    const r = computeBreathingRoom(0, 0, []);
    expect(r.breathingRoomMinor).toBe(0);
    expect(r.committedSlackMinor).toBe(0);
  });
  it("income only, no budgets → income", () => {
    const r = computeBreathingRoom(150000, 0, []);
    expect(r.breathingRoomMinor).toBe(150000);
    expect(r.committedSlackMinor).toBe(0);
  });
  it("expense only, no budgets → negative", () => {
    const r = computeBreathingRoom(0, 40000, []);
    expect(r.breathingRoomMinor).toBe(-40000);
    expect(r.committedSlackMinor).toBe(0);
  });
  it("income and expense, no budgets → net income", () => {
    const r = computeBreathingRoom(150000, 40000, []);
    expect(r.breathingRoomMinor).toBe(110000);
    expect(r.committedSlackMinor).toBe(0);
  });
  it("one partially-spent budget reduces breathing room by remaining slack", () => {
    // limit $500, actual $300 → slack $200 = 20000 minor
    const r = computeBreathingRoom(200000, 60000, [
      { limitMinor: 50000, actualMinor: 30000 },
    ]);
    expect(r.breathingRoomMinor).toBe(120000);
    expect(r.committedSlackMinor).toBe(20000);
  });
  it("over-spent budget (actual > limit) contributes zero committed slack", () => {
    // limit $200, actual $300 → max(0, -10000) = 0
    const r = computeBreathingRoom(200000, 60000, [
      { limitMinor: 20000, actualMinor: 30000 },
    ]);
    expect(r.breathingRoomMinor).toBe(140000);
    expect(r.committedSlackMinor).toBe(0);
  });
  it("multiple budgets — only partially-spent ones contribute slack", () => {
    // Budget A: slack 30000; Budget B: fully spent → 0; Budget C: slack 30000
    const r = computeBreathingRoom(300000, 120000, [
      { limitMinor: 50000, actualMinor: 20000 }, // slack 30000
      { limitMinor: 30000, actualMinor: 30000 }, // slack 0 (exactly spent)
      { limitMinor: 40000, actualMinor: 10000 }, // slack 30000
    ]);
    expect(r.breathingRoomMinor).toBe(120000);
    expect(r.committedSlackMinor).toBe(60000);
  });
  it("budget with zero actual — full limit is committed slack", () => {
    const r = computeBreathingRoom(100000, 0, [
      { limitMinor: 50000, actualMinor: 0 },
    ]);
    expect(r.breathingRoomMinor).toBe(50000);
    expect(r.committedSlackMinor).toBe(50000);
  });
});
