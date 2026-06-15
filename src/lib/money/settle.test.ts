import { describe, expect, it } from "vitest";
import { settleTally } from "./settle";
import type { Split, Watermark } from "./settle";

describe("settleTally", () => {
  it("Case 1 — Single split, no watermark: viewer is payer gets +partnerShare", () => {
    const splits: Split[] = [
      {
        transactionId: "tx1",
        payerId: "A",
        payerShareMinor: 5000,
        partnerShareMinor: 5000,
        transactionDate: "2026-05-01",
      },
    ];
    const tallyA = settleTally(splits, [], "A");
    const tallyB = settleTally(splits, [], "B");

    expect(tallyA).toBe(5000);
    expect(tallyB).toBe(-5000);
    expect(tallyA + tallyB).toBe(0);
  });

  it("Case 2 — Split then settle: tally resets to 0 (split is before watermark)", () => {
    const splits: Split[] = [
      {
        transactionId: "tx1",
        payerId: "A",
        payerShareMinor: 5000,
        partnerShareMinor: 5000,
        transactionDate: "2026-05-01",
      },
    ];
    const watermarks: Watermark[] = [{ settledAt: "2026-05-15T00:00:00Z" }];

    const tally = settleTally(splits, watermarks, "A");
    expect(tally).toBe(0);
  });

  it("Case 3 — Carryover: two splits, one settled, one not", () => {
    const splits: Split[] = [
      {
        transactionId: "tx1",
        payerId: "A",
        payerShareMinor: 5000,
        partnerShareMinor: 5000,
        transactionDate: "2026-05-01",
      },
      {
        transactionId: "tx2",
        payerId: "B",
        payerShareMinor: 1500,
        partnerShareMinor: 1500,
        transactionDate: "2026-05-20",
      },
    ];
    const watermarks: Watermark[] = [{ settledAt: "2026-05-15T00:00:00Z" }];

    const tallyA = settleTally(splits, watermarks, "A");
    const tallyB = settleTally(splits, watermarks, "B");

    expect(tallyA).toBe(-1500);
    expect(tallyB).toBe(1500);
    expect(tallyA + tallyB).toBe(0);
  });

  it("Case 4 — Idempotency: two watermarks, only latest counts; calling twice gives same result", () => {
    const splits: Split[] = [
      {
        transactionId: "tx1",
        payerId: "A",
        payerShareMinor: 5000,
        partnerShareMinor: 5000,
        transactionDate: "2026-05-01",
      },
      {
        transactionId: "tx2",
        payerId: "B",
        payerShareMinor: 1500,
        partnerShareMinor: 1500,
        transactionDate: "2026-05-20",
      },
      {
        transactionId: "tx3",
        payerId: "A",
        payerShareMinor: 1000,
        partnerShareMinor: 1000,
        transactionDate: "2026-06-01",
      },
    ];
    const watermarks: Watermark[] = [
      { settledAt: "2026-05-10T00:00:00Z" },
      { settledAt: "2026-05-25T00:00:00Z" },
    ];

    const tally1 = settleTally(splits, watermarks, "A");
    const tally2 = settleTally(splits, watermarks, "A");

    expect(tally1).toBe(1000);
    expect(tally2).toBe(1000);
  });

  it("Case 5 — Sign-flip: same data, viewer A vs viewer B are exact sign opposites", () => {
    const splits: Split[] = [
      {
        transactionId: "tx1",
        payerId: "A",
        payerShareMinor: 5000,
        partnerShareMinor: 5000,
        transactionDate: "2026-05-01",
      },
    ];

    const tallyA = settleTally(splits, [], "A");
    const tallyB = settleTally(splits, [], "B");

    expect(tallyA).toBe(5000);
    expect(tallyB).toBe(-5000);
    expect(tallyA + tallyB).toBe(0);
  });

  it("Case 6 — Zero balance: A and B each paid one equal split", () => {
    const splits: Split[] = [
      {
        transactionId: "tx1",
        payerId: "A",
        payerShareMinor: 5000,
        partnerShareMinor: 5000,
        transactionDate: "2026-05-01",
      },
      {
        transactionId: "tx2",
        payerId: "B",
        payerShareMinor: 5000,
        partnerShareMinor: 5000,
        transactionDate: "2026-05-02",
      },
    ];

    const tallyA = settleTally(splits, [], "A");
    const tallyB = settleTally(splits, [], "B");

    expect(tallyA).toBe(0);
    expect(tallyB).toBe(0);
    expect(tallyA + tallyB).toBe(0);
  });

  it("Case 7 — No splits: empty array returns 0", () => {
    const tally = settleTally([], [], "A");
    expect(tally).toBe(0);
  });
});
