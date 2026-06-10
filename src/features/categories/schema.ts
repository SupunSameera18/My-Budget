import { z } from "zod";

export const CATEGORY_TYPES = ["income", "expense"] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  income: "Income",
  expense: "Expense",
};

export const createCategorySchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(50, "Name must be 50 characters or fewer")
    .trim(),
  type: z.enum(CATEGORY_TYPES, { message: "Select income or expense" }),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(50, "Name must be 50 characters or fewer")
    .trim(),
});

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// DB row type (mirrors generated types — kept in sync with database.types.ts)
export type Category = {
  id: string;
  user_id: string;
  name: string;
  type: CategoryType;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

// ↓ Added by Story 2.5
export type Subcategory = {
  id: string;
  user_id: string;
  category_id: string;
  name: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

const subcategoryNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(50, "Name must be 50 characters or fewer");

export const createSubcategorySchema = z.object({
  name: subcategoryNameSchema,
});

export type CreateSubcategoryInput = z.infer<typeof createSubcategorySchema>;

export const updateSubcategorySchema = z.object({
  name: subcategoryNameSchema,
});

export type UpdateSubcategoryInput = z.infer<typeof updateSubcategorySchema>;
