import { z } from "zod";
import type { Account } from "@/features/accounts/schema";

export const logTransactionSchema = z.object({
  account_id: z.string().uuid("Select an account"),
  category_id: z.string().uuid("Select a category"),
  // Display amount as a decimal string; converted to minor units server-side.
  // type="text" inputMode="decimal" to avoid locale-specific decimal issues.
  amount_display: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{0,2})?$/, "Enter a valid amount (e.g. 4.50)")
    .refine((v) => parseFloat(v) > 0, {
      message: "Amount must be greater than zero",
    }),
  // ISO date (YYYY-MM-DD)
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  note: z
    .string()
    .trim()
    .max(280, "Note must be 280 characters or fewer")
    .optional(),
});

export type LogTransactionInput = z.infer<typeof logTransactionSchema>;

// DB row type (mirrors database.types.ts — kept in sync manually)
export type Transaction = {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string;
  amount_minor: number;
  date: string;
  note: string | null;
  type: string;
  created_at: string;
  updated_at: string;
};

export type TransactionCategory = {
  id: string;
  name: string;
  type: "income" | "expense";
};

export type TransactionFormData = {
  accounts: Account[];
  categories: TransactionCategory[];
  currency: string;
  defaultAccountId: string | null;
};
