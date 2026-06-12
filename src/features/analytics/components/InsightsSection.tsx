import type { InsightData } from "@/lib/analytics/insights";
import { InsightCard } from "@/features/analytics/components/InsightCard";

export function InsightsSection({ insights }: { insights: InsightData[] }) {
  return (
    <section aria-label="Insights" aria-live="polite">
      {insights.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-ink-secondary">
            Insights
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 md:flex-wrap">
            {insights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
