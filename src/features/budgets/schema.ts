import { z } from "zod";
import { parseAmountMinor } from "@/lib/money/parse-minor";
import { moneyDisplaySchema } from "@/lib/money/amount-schema";

export const BUDGET_PERIOD_TYPES = [
  "weekly",
  "monthly",
  "yearly",
  "custom",
] as const;
export type BudgetPeriodType = (typeof BUDGET_PERIOD_TYPES)[number];

export const createBudgetSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(100, "Name must be 100 characters or fewer"),
    limit_amount_display: moneyDisplaySchema.refine(
      (v) => parseAmountMinor(v) >= 1,
      { message: "Amount must be greater than zero" },
    ),
    period_type: z.enum(BUDGET_PERIOD_TYPES, {
      message: "Select a period type",
    }),
    category_ids: z
      .array(z.string().uuid())
      .min(1, "Select at least one category"),
    period_start: z.string().date().optional(),
    period_end: z.string().date().optional(),
  })
  .refine(
    (d) => d.period_type !== "custom" || (!!d.period_start && !!d.period_end),
    {
      message: "Custom period requires start and end dates",
      path: ["period_start"],
    },
  )
  .refine(
    (d) =>
      !(d.period_type === "custom" && d.period_start && d.period_end) ||
      d.period_start! <= d.period_end!,
    {
      message: "End date must be on or after start date",
      path: ["period_end"],
    },
  );

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;

export type Budget = {
  id: string;
  user_id: string;
  name: string;
  limit_minor: number;
  period_type: BudgetPeriodType;
  period_start: string | null;
  period_end: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BudgetCategory = {
  budget_id: string;
  category_id: string;
};

export type BudgetWithActual = Budget & {
  categories: { id: string; name: string }[];
  actual_minor: number;
  remaining_minor: number;
  pct_used: number;
};

export type BudgetFormData = {
  categories: { id: string; name: string }[];
  currency: string;
};
