export const MAX_CONFIDENCE_PCT = 74;

export type HealthScoreInput = {
  budgetAdherenceRate: number | null;
  cushionRate: number | null;
  savingsRate: number | null;
  goalProgressRate: number | null;
  transactionCount: number;
};

export type HealthScoreResult = {
  score: number;
  confidencePercent: number;
  hasEnoughData: boolean;
};

export function computeHealthScore(input: HealthScoreInput): HealthScoreResult {
  const {
    budgetAdherenceRate,
    cushionRate,
    savingsRate,
    goalProgressRate,
    transactionCount,
  } = input;

  const components: Array<{ weight: number; subScore: number }> = [];

  if (budgetAdherenceRate !== null) {
    components.push({
      weight: 0.4,
      subScore: Math.min(budgetAdherenceRate * 100, 100),
    });
  }
  if (cushionRate !== null) {
    components.push({
      weight: 0.3,
      subScore: Math.min((cushionRate / 0.2) * 100, 100),
    });
  }
  if (savingsRate !== null) {
    components.push({
      weight: 0.2,
      subScore: Math.min((savingsRate / 0.2) * 100, 100),
    });
  }
  if (goalProgressRate !== null) {
    components.push({
      weight: 0.1,
      subScore: Math.min(goalProgressRate * 100, 100),
    });
  }

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);

  let score = 0;
  if (totalWeight > 0) {
    const weightedSum = components.reduce(
      (sum, c) => sum + (c.weight / totalWeight) * c.subScore,
      0,
    );
    score = Math.min(100, Math.max(0, Math.floor(weightedSum + 0.5)));
  }

  const confidencePercent = Math.floor(
    Math.min(transactionCount / 30, 1) * MAX_CONFIDENCE_PCT,
  );
  const hasEnoughData = transactionCount >= 30;

  return { score, confidencePercent, hasEnoughData };
}
