"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/require-user";
import { ErrorCode, err, ok, type Result } from "@/lib/errors";
import {
  createBudgetSchema,
  type Budget,
  type BudgetWithActual,
  type BudgetFormData,
} from "@/features/budgets/schema";
import {
  currentWeekBoundaries,
  currentMonthBoundaries,
  currentYearBoundaries,
} from "@/lib/period";

function computePeriodBoundaries(budget: Budget): {
  start: string;
  end: string;
} {
  switch (budget.period_type) {
    case "weekly":
      return currentWeekBoundaries();
    case "monthly":
      return currentMonthBoundaries();
    case "yearly":
      return currentYearBoundaries();
    case "custom":
      return { start: budget.period_start ?? "", end: budget.period_end ?? "" };
  }
}

export async function getBudgetFormData(): Promise<Result<BudgetFormData>> {
  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.BudgetFetchFailed, "Not authenticated");
    const { supabase, user } = auth;

    const [catResult, profileResult] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name")
        .eq("user_id", user.id)
        .eq("type", "expense")
        .is("archived_at", null)
        .order("name"),
      supabase
        .from("profiles")
        .select("currency")
        .eq("user_id", user.id)
        .single(),
    ]);

    if (catResult.error) {
      return err(ErrorCode.BudgetFetchFailed, "Failed to load form data.");
    }

    const categories = (catResult.data ?? []) as { id: string; name: string }[];
    const currency = profileResult.data?.currency ?? "USD";

    return ok({ categories, currency });
  } catch {
    return err(ErrorCode.BudgetFetchFailed, "Failed to load form data.");
  }
}

export async function getBudgets(): Promise<Result<BudgetWithActual[]>> {
  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.BudgetFetchFailed, "Not authenticated");
    const { supabase, user } = auth;

    const [budgetsResult, txnsResult] = await Promise.all([
      supabase
        .from("budgets")
        .select("*, budget_categories(category_id, categories(name))")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("transactions")
        .select("amount_minor, date, category_id")
        .eq("user_id", user.id)
        .eq("type", "expense")
        .is("archived_at", null),
    ]);

    if (budgetsResult.error) {
      return err(ErrorCode.BudgetFetchFailed, "Failed to load budgets.");
    }

    if (txnsResult.error) {
      return err(ErrorCode.BudgetFetchFailed, "Failed to load budgets.");
    }

    const expenseTxns = (txnsResult.data ?? []) as {
      amount_minor: number;
      date: string;
      category_id: string;
    }[];

    const result: BudgetWithActual[] = (budgetsResult.data ?? []).map((b) => {
      const rawBudget = b as Budget & { budget_categories: unknown[] };

      const categories = (
        (rawBudget.budget_categories ?? []) as Array<{
          category_id: string;
          categories: { name: string } | null;
        }>
      ).map((bc) => ({
        id: bc.category_id,
        name: bc.categories?.name ?? "Unknown",
      }));

      const budget: Budget = {
        id: rawBudget.id,
        user_id: rawBudget.user_id,
        name: rawBudget.name,
        limit_minor: rawBudget.limit_minor,
        period_type: rawBudget.period_type,
        period_start: rawBudget.period_start,
        period_end: rawBudget.period_end,
        archived_at: rawBudget.archived_at,
        created_at: rawBudget.created_at,
        updated_at: rawBudget.updated_at,
      };

      const { start, end } = computePeriodBoundaries(budget);
      const categorySet = new Set(categories.map((c) => c.id));

      const actual_minor = expenseTxns
        .filter(
          (t) =>
            categorySet.has(t.category_id) && t.date >= start && t.date <= end,
        )
        .reduce((sum, t) => sum + t.amount_minor, 0);

      const remaining_minor = budget.limit_minor - actual_minor;
      const pct_used = (actual_minor / budget.limit_minor) * 100;

      return { ...budget, categories, actual_minor, remaining_minor, pct_used };
    });

    return ok(result);
  } catch {
    return err(ErrorCode.BudgetFetchFailed, "Failed to load budgets.");
  }
}

export async function createBudget(
  formData: FormData,
): Promise<Result<{ id: string }>> {
  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.BudgetCreateFailed, "Not authenticated");
    const { supabase } = auth;

    const raw = {
      name: formData.get("name") as string,
      limit_amount_display: formData.get("limit_amount_display") as string,
      period_type: formData.get("period_type") as string,
      period_start: (formData.get("period_start") as string) || undefined,
      period_end: (formData.get("period_end") as string) || undefined,
      category_ids: formData.getAll("category_ids").map(String),
    };

    const parsed = createBudgetSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return err(
        ErrorCode.BudgetCreateFailed,
        first?.message ?? "Invalid data",
        String(first?.path[0] ?? ""),
      );
    }

    const limit_minor = Math.round(
      parseFloat(parsed.data.limit_amount_display) * 100,
    );
    const { name, period_type, period_start, period_end, category_ids } =
      parsed.data;

    const { data, error } = await supabase.rpc("rpc_create_budget", {
      p_name: name,
      p_limit_minor: limit_minor,
      p_period_type: period_type,
      p_period_start: period_start ?? null,
      p_period_end: period_end ?? null,
      p_category_ids: category_ids,
    });

    if (error) {
      if (error.code === "23505") {
        return err(
          ErrorCode.BudgetCreateFailed,
          "A budget with this name already exists.",
          "name",
        );
      }
      return err(ErrorCode.BudgetCreateFailed, "Failed to create budget.");
    }

    revalidatePath("/budgets");
    return ok({ id: data as string });
  } catch {
    return err(ErrorCode.BudgetCreateFailed, "An unexpected error occurred.");
  }
}
