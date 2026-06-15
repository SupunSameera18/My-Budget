export interface Split {
  transactionId: string;
  payerId: string;
  payerShareMinor: number;
  partnerShareMinor: number;
  transactionDate: string; // YYYY-MM-DD
}

export interface Watermark {
  settledAt: string; // ISO timestamp: "2026-05-15T00:00:00Z"
}

// Returns signed integer minor units.
// Positive = viewer is owed money (creditor).
// Negative = viewer owes money (debtor).
export function settleTally(
  splits: Split[],
  watermarks: Watermark[],
  viewerId: string,
): number {
  const cutoff =
    watermarks.length > 0
      ? watermarks.reduce((latest, w) =>
          w.settledAt > latest.settledAt ? w : latest,
        ).settledAt
      : null;

  const activeSplits = cutoff
    ? splits.filter((s) => s.transactionDate > cutoff.slice(0, 10))
    : splits;

  return activeSplits.reduce((sum, split) => {
    if (split.payerId === viewerId) {
      return sum + split.partnerShareMinor;
    } else {
      return sum - split.partnerShareMinor;
    }
  }, 0);
}
