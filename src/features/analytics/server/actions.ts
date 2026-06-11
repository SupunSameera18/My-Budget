"use server";

import { requireUser } from "@/lib/supabase/require-user";
import { currentMonthBoundaries } from "@/lib/period";
import type { HealthScoreResult } from "@/lib/money/health-score";

export async function getHealthScore(period?: {
  start: string;
  end: string;
}): Promise<HealthScoreResult | null> {
  const session = await requireUser();
  if (!session) return null;
  const { supabase } = session;

  const { start, end } = period ?? currentMonthBoundaries();

  try {
    const { data, error } = await supabase.rpc("rpc_get_health_score", {
      p_period_start: start,
      p_period_end: end,
    });
    if (error || !data?.[0]) return null;
    return {
      score: data[0].score,
      confidencePercent: data[0].confidence_percent,
      hasEnoughData: data[0].has_enough_data,
    };
  } catch {
    return null;
  }
}
