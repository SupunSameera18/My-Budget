import { getHealthScore } from "@/features/analytics/server/actions";
import { HealthScoreDisplay } from "./HealthScoreDisplay";

interface HealthScoreCardProps {
  period?: { start: string; end: string };
}

export async function HealthScoreCard({ period }: HealthScoreCardProps = {}) {
  const result = await getHealthScore(period);
  if (!result) return null;
  return <HealthScoreDisplay result={result} />;
}
