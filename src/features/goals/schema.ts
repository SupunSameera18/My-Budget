import { z } from "zod";
import { moneyDisplaySchema } from "@/lib/money/amount-schema";

export const reclassifyGoalSchema = z.object({
  goal_id: z.string().uuid("Invalid goal"),
  to_shared: z.enum(["true", "false"]),
});

export const createGoalSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or fewer")
    .trim(),
  target_amount_display: moneyDisplaySchema,
  is_shared: z.enum(["true"]).optional(),
});

export const contributeGoalSchema = z.object({
  goal_id: z.string().uuid("Invalid goal"),
  amount_display: moneyDisplaySchema,
  date: z.string().date("Invalid date"),
});

export const editGoalTargetSchema = z.object({
  goal_id: z.string().uuid("Invalid goal"),
  target_amount_display: moneyDisplaySchema,
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type ContributeGoalInput = z.infer<typeof contributeGoalSchema>;
export type EditGoalTargetInput = z.infer<typeof editGoalTargetSchema>;
export type ReclassifyGoalInput = z.infer<typeof reclassifyGoalSchema>;

export type GoalContributionItem = {
  id: string;
  user_id: string;
  goal_id: string;
  amount_minor: number;
  date: string;
  macro_application_id: string | null;
};

export type GoalWithProgress = {
  id: string;
  user_id: string;
  name: string;
  target_minor: number;
  currentMinor: number;
  remaining_minor: number;
  pctUsed: number;
  created_at: string;
  is_shared: boolean;
  isOwner: boolean;
  myContributionMinor?: number;
  partnerContributionMinor?: number;
  partnerContributorId?: string;
};
