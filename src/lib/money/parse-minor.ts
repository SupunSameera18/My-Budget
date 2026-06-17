/**
 * Converts a user-facing decimal display string (e.g. "12.50") to an integer
 * minor-unit value (e.g. 1250 cents). Uses Math.round to avoid float drift.
 */
export function parseAmountMinor(displayStr: string): number {
  const n = parseFloat(displayStr);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
