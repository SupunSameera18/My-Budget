import { getBreathingRoomData } from "@/features/dashboard/server/actions";
import { formatMoney } from "@/lib/format";

export async function BreathingRoomCard() {
  const result = await getBreathingRoomData();
  if (!result.ok) return null;

  const { breathingRoomMinor, currency, hasActivity } = result.data;
  const isLow = breathingRoomMinor < 0;

  // bg-breathing-low/10 opacity modifier doesn't work — CSS var is hex, not channels.
  // Use inline style fallback for amber tint.
  const sectionStyle = isLow
    ? {
        backgroundColor: "rgba(201, 162, 75, 0.1)",
        borderColor: "rgba(201, 162, 75, 0.3)",
      }
    : undefined;
  const sectionClass =
    "rounded-xl border p-4 shadow-sm" +
    (isLow ? "" : " border-hairline bg-card");

  return (
    <section
      aria-label="Breathing Room"
      className={sectionClass}
      style={sectionStyle}
    >
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
        This Month
      </p>
      <h2 className="mb-2 text-base font-bold text-ink-primary">
        Breathing Room
      </h2>
      {!hasActivity ? (
        <>
          <p className="text-sm text-ink-secondary">
            Nothing tracked yet this month.
          </p>
          <p className="mt-1 text-sm text-ink-secondary">
            <span className="md:hidden">
              Tap + to log your first transaction.
            </span>
            <span className="hidden md:inline">
              Log a transaction to track your spending.
            </span>
          </p>
        </>
      ) : (
        <>
          <p
            className={`text-4xl font-bold ${isLow ? "text-breathing-low-text" : "text-ink-primary"}`}
            style={{
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.8px",
            }}
          >
            {formatMoney(breathingRoomMinor, currency)}
          </p>
          <p
            className={`mt-2 text-sm ${isLow ? "text-breathing-low-text" : "text-ink-secondary"}`}
          >
            {isLow
              ? "Getting tight — go gently for a bit."
              : "left to spend this month"}
          </p>
        </>
      )}
    </section>
  );
}
