import { z } from "zod";
import { moneyDisplaySchema } from "@/lib/money/amount-schema";

export const createMacroSchema = z
  .object({
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name must be 100 characters or fewer")
      .trim(),
    amount_display: moneyDisplaySchema,
    category_id: z.string().uuid("Category is required"),
    target_type: z.enum(["account", "goal"]),
    account_id: z.string().uuid().nullable().optional(),
    goal_id: z.string().uuid().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.target_type === "account" && !data.account_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Account is required",
        path: ["account_id"],
      });
    }
    if (data.target_type === "goal" && !data.goal_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Goal is required",
        path: ["goal_id"],
      });
    }
  });

export const updateMacroSchema = z
  .object({
    macro_id: z.string().uuid("Macro ID is required"),
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name must be 100 characters or fewer")
      .trim(),
    amount_display: moneyDisplaySchema,
    category_id: z.string().uuid("Category is required"),
    target_type: z.enum(["account", "goal"]),
    account_id: z.string().uuid().nullable().optional(),
    goal_id: z.string().uuid().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.target_type === "account" && !data.account_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Account is required",
        path: ["account_id"],
      });
    }
    if (data.target_type === "goal" && !data.goal_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Goal is required",
        path: ["goal_id"],
      });
    }
  });

export type CreateMacroInput = z.infer<typeof createMacroSchema>;
export type UpdateMacroInput = z.infer<typeof updateMacroSchema>;

export type Macro = {
  id: string;
  user_id: string;
  name: string;
  amount_minor: number;
  account_id: string | null;
  goal_id: string | null;
  category_id: string;
  last_used_at: string | null;
  archived_at: string | null;
  created_at: string;
};

export type MacroWithTarget = Macro & {
  account_name: string | null;
  goal_name: string | null;
  category_name: string;
};
