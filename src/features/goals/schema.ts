import { z } from "zod";

export const createGoalSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or fewer")
    .trim(),
  target_amount_display: z
    .string()
    .min(1, "Target amount is required")
    .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid decimal amount (e.g. 100.00)"),
});

export const contributeGoalSchema = z.object({
  goal_id: z.string().uuid("Invalid goal"),
  amount_display: z
    .string()
    .min(1, "Amount is required")
    .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid decimal amount (e.g. 10.00)"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
    .refine((v) => !isNaN(Date.parse(v)), "Invalid date"),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type ContributeGoalInput = z.infer<typeof contributeGoalSchema>;

export type GoalWithProgress = {
  id: string;
  name: string;
  target_minor: number;
  currentMinor: number;
  remaining_minor: number;
  pctUsed: number;
  created_at: string;
};
