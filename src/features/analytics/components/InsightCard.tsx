import type { InsightData, InsightSentiment } from "@/lib/analytics/insights";

const sentimentClass: Record<InsightSentiment, string> = {
  positive: "border-l-4 border-l-income bg-card",
  warning: "border-l-4 border-l-expense bg-card",
  neutral: "border border-hairline bg-card",
};

export function InsightCard({ insight }: { insight: InsightData }) {
  return (
    <div
      className={`min-w-[180px] rounded-lg p-3 shadow-sm ${sentimentClass[insight.sentiment]}`}
    >
      <p className="text-sm font-semibold text-ink-primary">
        {insight.headline}
      </p>
      {insight.detail && (
        <p className="mt-0.5 text-xs text-ink-secondary">{insight.detail}</p>
      )}
    </div>
  );
}
