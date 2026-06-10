"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/require-user";
import { ErrorCode, err, ok, type Result } from "@/lib/errors";
import {
  createCategorySchema,
  updateCategorySchema,
  createSubcategorySchema,
  updateSubcategorySchema,
  type Category,
  type Subcategory,
} from "@/features/categories/schema";

export async function getCategories(): Promise<Result<Category[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      return err(ErrorCode.CategoryFetchFailed, "Failed to load categories.");
    }

    return ok((data ?? []) as Category[]);
  } catch {
    return err(ErrorCode.CategoryFetchFailed, "Failed to load categories.");
  }
}

export async function createCategory(
  formData: FormData,
): Promise<Result<Category>> {
  const raw = Object.fromEntries(formData);
  const parsed = createCategorySchema.safeParse(raw);

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return err(
      ErrorCode.CategoryCreateFailed,
      first?.message ?? "Invalid data",
      String(first?.path[0] ?? ""),
    );
  }

  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.CategoryCreateFailed, "Not authenticated");
    const { supabase, user } = auth;

    const { data, error } = await supabase
      .from("categories")
      .insert({
        user_id: user.id,
        name: parsed.data.name,
        type: parsed.data.type,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return err(
          ErrorCode.CategoryCreateFailed,
          "A category with that name and type already exists.",
        );
      }
      return err(
        ErrorCode.CategoryCreateFailed,
        "Failed to create category. Please try again.",
      );
    }

    revalidatePath("/settings/categories");
    revalidatePath("/transactions/new");
    return ok(data as Category);
  } catch {
    return err(
      ErrorCode.CategoryCreateFailed,
      "An unexpected error occurred. Please try again.",
    );
  }
}

export async function updateCategory(
  id: string,
  formData: FormData,
): Promise<Result<Category>> {
  const raw = Object.fromEntries(formData);
  const parsed = updateCategorySchema.safeParse(raw);

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return err(
      ErrorCode.CategoryUpdateFailed,
      first?.message ?? "Invalid data",
      String(first?.path[0] ?? ""),
    );
  }

  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.CategoryUpdateFailed, "Not authenticated");
    const { supabase } = auth;

    const { data, error } = await supabase
      .from("categories")
      .update({ name: parsed.data.name })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      if (error?.code === "23505") {
        return err(
          ErrorCode.CategoryUpdateFailed,
          "A category with that name and type already exists.",
        );
      }
      return err(
        ErrorCode.CategoryUpdateFailed,
        "Failed to update category. Please try again.",
      );
    }

    revalidatePath("/settings/categories");
    revalidatePath("/transactions/new");
    return ok(data as Category);
  } catch {
    return err(ErrorCode.CategoryUpdateFailed, "An unexpected error occurred.");
  }
}

export async function archiveCategory(id: string): Promise<Result<void>> {
  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.CategoryArchiveFailed, "Not authenticated");
    const { supabase } = auth;

    const { data, error } = await supabase
      .from("categories")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      return err(
        ErrorCode.CategoryArchiveFailed,
        "Failed to archive category. Please try again.",
      );
    }

    revalidatePath("/settings/categories");
    revalidatePath("/transactions/new");
    return ok();
  } catch {
    return err(
      ErrorCode.CategoryArchiveFailed,
      "An unexpected error occurred.",
    );
  }
}

export async function unarchiveCategory(id: string): Promise<Result<void>> {
  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.CategoryArchiveFailed, "Not authenticated");
    const { supabase } = auth;

    const { data, error } = await supabase
      .from("categories")
      .update({ archived_at: null })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      return err(
        ErrorCode.CategoryArchiveFailed,
        "Failed to unarchive category. Please try again.",
      );
    }

    revalidatePath("/settings/categories");
    revalidatePath("/transactions/new");
    return ok();
  } catch {
    return err(
      ErrorCode.CategoryArchiveFailed,
      "An unexpected error occurred.",
    );
  }
}

export async function deleteCategory(id: string): Promise<Result<void>> {
  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.CategoryDeleteFailed, "Not authenticated");
    const { supabase } = auth;

    const { error } = await supabase.rpc("rpc_delete_category", {
      p_category_id: id,
    });

    if (error) {
      const msg =
        error.hint === "ARCHIVE_INSTEAD_OF_DELETE"
          ? "Cannot delete — this category has transaction history. Archive it instead."
          : error.hint === "ARCHIVE_BEFORE_DELETE"
            ? "Cannot delete an active category — archive it first."
            : "Failed to delete category. Please try again.";
      return err(ErrorCode.CategoryDeleteFailed, msg);
    }

    revalidatePath("/settings/categories");
    return ok();
  } catch {
    return err(ErrorCode.CategoryDeleteFailed, "An unexpected error occurred.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcategory actions — Added by Story 2.5
// ─────────────────────────────────────────────────────────────────────────────

export async function toggleSubcategories(
  enabled: boolean,
): Promise<Result<void>> {
  try {
    const auth = await requireUser();
    if (!auth)
      return err(ErrorCode.SubcategoryToggleFailed, "Not authenticated");
    const { supabase, user } = auth;
    const { error } = await supabase
      .from("profiles")
      .update({ subcategories_enabled: enabled })
      .eq("user_id", user.id);
    if (error)
      return err(
        ErrorCode.SubcategoryToggleFailed,
        "Failed to update subcategory setting.",
      );
    revalidatePath("/settings/categories");
    revalidatePath("/transactions/new");
    return ok();
  } catch {
    return err(
      ErrorCode.SubcategoryToggleFailed,
      "An unexpected error occurred.",
    );
  }
}

export async function createSubcategory(
  categoryId: string,
  formData: FormData,
): Promise<Result<Subcategory>> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      categoryId,
    )
  ) {
    return err(ErrorCode.SubcategoryCreateFailed, "Invalid category.");
  }

  const raw = Object.fromEntries(formData);
  const parsed = createSubcategorySchema.safeParse(raw);

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return err(
      ErrorCode.SubcategoryCreateFailed,
      first?.message ?? "Invalid data",
      String(first?.path[0] ?? ""),
    );
  }

  try {
    const auth = await requireUser();
    if (!auth)
      return err(ErrorCode.SubcategoryCreateFailed, "Not authenticated");
    const { supabase, user } = auth;

    const { data: cat } = await supabase
      .from("categories")
      .select("id")
      .eq("id", categoryId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!cat) {
      return err(ErrorCode.SubcategoryCreateFailed, "Category not found.");
    }

    const { data, error } = await supabase
      .from("subcategories")
      .insert({
        user_id: user.id,
        category_id: categoryId,
        name: parsed.data.name,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return err(
          ErrorCode.SubcategoryCreateFailed,
          "A subcategory with that name already exists under this category.",
        );
      }
      return err(
        ErrorCode.SubcategoryCreateFailed,
        "Failed to create subcategory. Please try again.",
      );
    }

    revalidatePath("/settings/categories");
    revalidatePath("/transactions/new");
    return ok(data as Subcategory);
  } catch {
    return err(
      ErrorCode.SubcategoryCreateFailed,
      "An unexpected error occurred. Please try again.",
    );
  }
}

export async function updateSubcategory(
  id: string,
  formData: FormData,
): Promise<Result<Subcategory>> {
  const raw = Object.fromEntries(formData);
  const parsed = updateSubcategorySchema.safeParse(raw);

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return err(
      ErrorCode.SubcategoryUpdateFailed,
      first?.message ?? "Invalid data",
      String(first?.path[0] ?? ""),
    );
  }

  try {
    const auth = await requireUser();
    if (!auth)
      return err(ErrorCode.SubcategoryUpdateFailed, "Not authenticated");
    const { supabase } = auth;

    const { data, error } = await supabase
      .from("subcategories")
      .update({ name: parsed.data.name })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      if (error?.code === "23505") {
        return err(
          ErrorCode.SubcategoryUpdateFailed,
          "A subcategory with that name already exists under this category.",
        );
      }
      return err(
        ErrorCode.SubcategoryUpdateFailed,
        "Failed to update subcategory. Please try again.",
      );
    }

    revalidatePath("/settings/categories");
    revalidatePath("/transactions/new");
    return ok(data as Subcategory);
  } catch {
    return err(
      ErrorCode.SubcategoryUpdateFailed,
      "An unexpected error occurred.",
    );
  }
}

export async function archiveSubcategory(id: string): Promise<Result<void>> {
  try {
    const auth = await requireUser();
    if (!auth)
      return err(ErrorCode.SubcategoryArchiveFailed, "Not authenticated");
    const { supabase } = auth;

    const { data, error } = await supabase
      .from("subcategories")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      return err(
        ErrorCode.SubcategoryArchiveFailed,
        "Failed to archive subcategory. Please try again.",
      );
    }

    revalidatePath("/settings/categories");
    revalidatePath("/transactions/new");
    return ok();
  } catch {
    return err(
      ErrorCode.SubcategoryArchiveFailed,
      "An unexpected error occurred.",
    );
  }
}

export async function unarchiveSubcategory(id: string): Promise<Result<void>> {
  try {
    const auth = await requireUser();
    if (!auth)
      return err(ErrorCode.SubcategoryArchiveFailed, "Not authenticated");
    const { supabase } = auth;

    const { data, error } = await supabase
      .from("subcategories")
      .update({ archived_at: null })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      return err(
        ErrorCode.SubcategoryArchiveFailed,
        "Failed to unarchive subcategory. Please try again.",
      );
    }

    revalidatePath("/settings/categories");
    revalidatePath("/transactions/new");
    return ok();
  } catch {
    return err(
      ErrorCode.SubcategoryArchiveFailed,
      "An unexpected error occurred.",
    );
  }
}

export async function deleteSubcategory(id: string): Promise<Result<void>> {
  try {
    const auth = await requireUser();
    if (!auth)
      return err(ErrorCode.SubcategoryDeleteFailed, "Not authenticated");
    const { supabase } = auth;

    const { error } = await supabase.rpc("rpc_delete_subcategory", {
      p_subcategory_id: id,
    });

    if (error) {
      const msg = error.message?.includes("transaction history")
        ? "Cannot delete — this subcategory has transaction history. Archive it instead."
        : "Failed to delete subcategory. Please try again.";
      return err(ErrorCode.SubcategoryDeleteFailed, msg);
    }

    revalidatePath("/settings/categories");
    revalidatePath("/transactions/new");
    return ok();
  } catch {
    return err(
      ErrorCode.SubcategoryDeleteFailed,
      "An unexpected error occurred.",
    );
  }
}
