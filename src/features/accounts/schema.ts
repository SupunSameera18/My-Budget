import { z } from "zod";

export const ACCOUNT_TYPES = ["cash", "bank", "savings"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "Cash",
  bank: "Bank",
  savings: "Savings",
};

export const createAccountSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(50, "Name must be 50 characters or fewer")
    .trim(),
  type: z.enum(ACCOUNT_TYPES),
  openingBalance: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{0,2})?$/, "Enter a valid amount (e.g. 100.00)")
    .default("0"),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;

// DB row type (mirrors generated types — kept in sync with database.types.ts)
export type Account = {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  actual_balance_minor: number;
  currency: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};
