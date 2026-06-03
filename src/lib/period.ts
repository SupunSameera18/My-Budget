/** UTC-based period boundary math for the E1 thin seam.
 * Timezone per user preference is a future enhancement (added when user prefs are stored, E4+).
 */

/** Returns 'YYYY-MM-DD' for the first day of the given month (UTC). */
export function currentMonthStart(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/** Returns 'YYYY-MM-DD' for the last day of the given month (UTC). */
export function currentMonthEnd(now: Date = new Date()): string {
  // Day 0 of the next month = last day of the current month
  const last = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  );
  const y = last.getUTCFullYear();
  const m = String(last.getUTCMonth() + 1).padStart(2, "0");
  const d = String(last.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Convenience: both boundaries for the current calendar month, from a single clock capture. */
export function currentMonthBoundaries(): { start: string; end: string } {
  const now = new Date();
  return { start: currentMonthStart(now), end: currentMonthEnd(now) };
}
