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

export const updateAccountSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(50, "Name must be 50 characters or fewer")
    .trim(),
  type: z.enum(ACCOUNT_TYPES),
});

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export const internalTransferSchema = z
  .object({
    from_account_id: z.string().uuid("Select a source account"),
    to_account_id: z.string().uuid("Select a destination account"),
    amount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{0,2})?$/, "Enter a valid amount (e.g. 100.00)")
      .refine((v) => parseFloat(v) > 0, "Amount must be greater than 0"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
    note: z
      .string()
      .max(255, "Note must be 255 characters or fewer")
      .optional(),
  })
  .refine((data) => data.from_account_id !== data.to_account_id, {
    message: "Source and destination accounts must be different",
    path: ["to_account_id"],
  });

export type InternalTransferInput = z.infer<typeof internalTransferSchema>;

export const TRANSFER_DIRECTIONS = ["in", "out"] as const;
export type TransferDirection = (typeof TRANSFER_DIRECTIONS)[number];

export const externalTransferSchema = z.object({
  account_id: z.string().uuid("Select an account"),
  direction: z.enum(["in", "out"], { message: "Select a direction" }),
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{0,2})?$/, "Enter a valid amount (e.g. 100.00)")
    .refine((v) => parseFloat(v) > 0, "Amount must be greater than 0"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  note: z.string().max(255, "Note must be 255 characters or fewer").optional(),
});

export type ExternalTransferInput = z.infer<typeof externalTransferSchema>;

export type Transfer = {
  id: string;
  user_id: string;
  type: "internal" | "external";
  from_account_id: string | null;
  to_account_id: string | null;
  amount_minor: number;
  date: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

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
