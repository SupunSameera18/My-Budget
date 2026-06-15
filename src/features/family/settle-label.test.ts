import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatMoney } from "@/lib/format";

vi.mock("@/lib/format", () => ({
  formatMoney: vi.fn(
    (n: number | bigint) => `$${(Math.abs(Number(n)) / 100).toFixed(2)}`,
  ),
}));

import { deriveSettleUpLabel } from "./settle-label";

beforeEach(() => {
  vi.mocked(formatMoney).mockImplementation(
    (n: number | bigint) => `$${(Math.abs(Number(n)) / 100).toFixed(2)}`,
  );
});

describe("deriveSettleUpLabel", () => {
  it("positive tally: viewer is owed → Receive from partner", () => {
    expect(deriveSettleUpLabel(5000, "Alex", "USD")).toBe(
      "Receive $50.00 from Alex",
    );
  });

  it("negative tally: viewer owes → Transfer to partner", () => {
    expect(deriveSettleUpLabel(-5000, "Alex", "USD")).toBe(
      "Transfer $50.00 to Alex",
    );
  });

  it("zero tally: all settled up", () => {
    expect(deriveSettleUpLabel(0, "Alex", "USD")).toBe(
      "You're all settled up.",
    );
  });

  it("tally=1 (one cent positive): Receive $0.01 from Alex", () => {
    expect(deriveSettleUpLabel(1, "Alex", "USD")).toBe(
      "Receive $0.01 from Alex",
    );
  });

  it("tally=-1 (one cent negative): Transfer $0.01 to Alex", () => {
    expect(deriveSettleUpLabel(-1, "Alex", "USD")).toBe(
      "Transfer $0.01 to Alex",
    );
  });
});
