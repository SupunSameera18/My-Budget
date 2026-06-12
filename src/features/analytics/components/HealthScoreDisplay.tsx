import { ProgressBar } from "@/components/ui/ProgressBar";
import type { HealthScoreResult } from "@/lib/money/health-score";

interface HealthScoreDisplayProps {
  result: HealthScoreResult | null;
}

export function HealthScoreDisplay({ result }: HealthScoreDisplayProps) {
  if (!result) return null;

  const { score, confidencePercent, hasEnoughData } = result;

  return (
    <section
      aria-label="Financial Health Score"
      className="rounded-xl border border-hairline bg-card p-4 shadow-sm"
    >
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
        Health Score
      </p>
      <div role="status" aria-live="polite">
        {hasEnoughData ? (
          <p
            className="text-4xl font-bold text-ink-primary"
            style={{
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.8px",
            }}
          >
            {score}
          </p>
        ) : (
          <p className="text-sm text-ink-secondary">
            Keep logging to see your score
          </p>
        )}
      </div>
      <div className="mt-3">
        <ProgressBar
          pctUsed={hasEnoughData ? (confidencePercent / 74) * 100 : 0}
          noAmber={true}
          ariaLabel="Score confidence"
        />
        <p className="mt-1 text-xs text-ink-secondary">
          {hasEnoughData
            ? `${confidencePercent}% confidence`
            : "Log more transactions to build confidence"}
        </p>
      </div>
    </section>
  );
}
