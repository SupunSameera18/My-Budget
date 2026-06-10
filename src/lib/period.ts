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

/** Returns ISO week boundaries (Mon–Sun) for the given date (UTC). */
export function currentWeekBoundaries(now: Date = new Date()): {
  start: string;
  end: string;
} {
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysFromMon = (day + 6) % 7; // 0=Mon, ..., 6=Sun
  const mon = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysFromMon,
    ),
  );
  const sun = new Date(
    Date.UTC(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate() + 6),
  );
  const fmt = (d: Date) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  return { start: fmt(mon), end: fmt(sun) };
}

/** Returns boundaries for the current UTC year: Jan 1 and Dec 31. */
export function currentYearBoundaries(now: Date = new Date()): {
  start: string;
  end: string;
} {
  const y = now.getUTCFullYear();
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}
