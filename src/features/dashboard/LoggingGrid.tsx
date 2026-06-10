import { getLoggingGridData } from "@/features/dashboard/server/actions";

type LogDotProps = { day: number; isToday: boolean; isFilled: boolean };

function LogDot({ day, isToday, isFilled }: LogDotProps) {
  let className = "w-5 h-5 rounded-full ";
  if (isFilled && isToday) {
    className +=
      "bg-brand-accent ring-2 ring-brand-accent ring-offset-1 ring-offset-card";
  } else if (isFilled) {
    className += "bg-brand-accent";
  } else if (isToday) {
    className += "border-2 border-brand-accent";
  } else {
    className += "border border-hairline";
  }

  const ariaLabel = [
    `Day ${day}`,
    isToday ? "(today)" : null,
    isFilled ? "(logged)" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={className} role="img" aria-label={ariaLabel} />;
}

export async function LoggingGrid() {
  const result = await getLoggingGridData();
  if (!result.ok) return null;

  const {
    datesWithActivity,
    todayStr,
    daysInMonth,
    monthYear,
    firstWeekdayOffset,
  } = result.data;

  return (
    <section
      aria-label="Logging Grid"
      className="rounded-xl border border-hairline bg-card p-4 shadow-sm"
    >
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
        This Month
      </p>
      <h2 className="mb-3 text-base font-bold text-ink-primary">
        Logging Grid
      </h2>

      {/* Day-of-week header: Monday-first ISO week */}
      <div className="mb-1 grid grid-cols-7">
        {["M", "T", "W", "T", "F", "S", "S"].map((label, i) => (
          <div
            key={i}
            className="text-center text-xs text-ink-secondary"
            aria-hidden="true"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Dot grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstWeekdayOffset }).map((_, i) => (
          <div key={`pad-${i}`} aria-hidden="true" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${monthYear}-${String(day).padStart(2, "0")}`;
          return (
            <div key={day} className="flex items-center justify-center">
              <LogDot
                day={day}
                isToday={dateStr === todayStr}
                isFilled={datesWithActivity.includes(dateStr)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
