import { z } from "zod";
import type { Account } from "@/features/accounts/schema";
import type { Subcategory } from "@/features/categories/schema";

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
  // Optional subcategory — select emits "" when placeholder chosen; treat as absent
  subcategory_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  // is_shared: "true" | "false" from FormData string; defaults to "false"
  is_shared: z.enum(["true", "false"]).optional(),
});

export type LogTransactionInput = z.infer<typeof logTransactionSchema>;

// DB row type (mirrors database.types.ts — kept in sync manually)
export type Transaction = {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string;
  subcategory_id: string | null;
  amount_minor: number;
  date: string;
  note: string | null;
  type: string;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type TransactionCategory = {
  id: string;
  name: string;
  type: "income" | "expense";
};

export type TransactionDefaults = {
  defaultType?: "personal" | "shared";
  defaultSplitMethod?: "equal" | "percentage" | "fixed" | "none";
};

export type TransactionFormData = {
  accounts: Account[];
  categories: TransactionCategory[];
  currency: string;
  defaultAccountId: string | null;
  subcategoriesEnabled: boolean;
  subcategories: Subcategory[];
  currentBreathingRoomMinor: number;
  macros: import("@/features/macros/schema").MacroWithTarget[];
  transactionDefaults: TransactionDefaults | null;
  isFamilyMode: boolean;
};

export type { Subcategory };

// Edit transaction schema — same validation shape as logTransactionSchema
export const editTransactionSchema = z.object({
  account_id: z.string().uuid("Select an account"),
  category_id: z.string().uuid("Select a category"),
  amount_display: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{0,2})?$/, "Enter a valid amount (e.g. 4.50)")
    .refine((v) => parseFloat(v) > 0, {
      message: "Amount must be greater than zero",
    }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  note: z
    .string()
    .trim()
    .max(280, "Note must be 280 characters or fewer")
    .optional(),
  subcategory_id: z.union([z.string().uuid(), z.literal("")]).optional(),
});

export type EditTransactionInput = z.infer<typeof editTransactionSchema>;

export type ActivityTrailEntry = {
  id: string;
  user_id: string;
  transaction_id: string;
  change_type:
    | "edit"
    | "delete"
    | "reclassified_to_shared"
    | "reclassified_to_personal";
  changed_fields:
    | Record<string, { old: unknown; new: unknown }>
    | Record<string, never>;
  created_at: string;
};

export type EditTransactionFormData = {
  transaction: Transaction;
  accounts: Account[];
  categories: TransactionCategory[];
  currency: string;
  subcategoriesEnabled: boolean;
  subcategories: Subcategory[];
  partnerName?: string;
  viewerUserId: string;
  isFamilyMode?: boolean;
  partnerJoinDate?: string | null;
};

// Edit shared transaction schema — amount is excluded (server enforces this structurally)
export const editSharedTransactionSchema = z.object({
  category_id: z.string().uuid("Select a category"),
  note: z
    .string()
    .trim()
    .max(280, "Note must be 280 characters or fewer")
    .optional(),
});

export type EditSharedTransactionInput = z.infer<
  typeof editSharedTransactionSchema
>;

// ---- Transaction list & filter (Story 3.4) ----

export type TransactionListItem = {
  id: string;
  account_id: string;
  category_id: string;
  amount_minor: number;
  date: string;
  note: string | null;
  type: "income" | "expense";
  is_shared: boolean;
  created_at: string;
  account_name: string;
  category_name: string;
};

export type TransactionListFilters = {
  account_id?: string;
  category_id?: string;
  from?: string;
  to?: string;
  showArchivedAccounts?: boolean;
  showArchivedCategories?: boolean;
  isFamilyMode?: boolean;
  familyUnitId?: string;
  scope?: import("@/features/analytics/schema").Scope;
};

export type TransactionListFilterAccount = Pick<
  Account,
  "id" | "name" | "archived_at"
>;

export type TransactionListFilterCategory = {
  id: string;
  name: string;
  type: "income" | "expense";
  archived_at: string | null;
};

export type TransactionListData = {
  items: TransactionListItem[];
  accounts: TransactionListFilterAccount[];
  categories: TransactionListFilterCategory[];
  currency: string;
  familyUnitId?: string;
};
