"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/require-user";
import { err, ok, ErrorCode, type Result } from "@/lib/errors";
import type { UserDataExport } from "@/features/settings/schema";

export async function getAllUserData(): Promise<Result<UserDataExport>> {
  const auth = await requireUser();
  if (!auth) redirect("/auth/login");
  const { supabase } = auth;

  const [
    accountsResult,
    categoriesResult,
    transactionsResult,
    budgetsResult,
    budgetCategoriesResult,
    goalsResult,
    goalContributionsResult,
    macrosResult,
    transfersResult,
  ] = await Promise.all([
    supabase.from("accounts").select("*"),
    supabase.from("categories").select("*"),
    supabase.from("transactions").select("*"),
    supabase.from("budgets").select("*"),
    supabase.from("budget_categories").select("*"),
    supabase.from("goals").select("*"),
    supabase.from("goal_contributions").select("*"),
    supabase.from("macros").select("*"),
    supabase.from("transfers").select("*"),
  ]);

  if (
    accountsResult.error ||
    categoriesResult.error ||
    transactionsResult.error ||
    budgetsResult.error ||
    budgetCategoriesResult.error ||
    goalsResult.error ||
    goalContributionsResult.error ||
    macrosResult.error ||
    transfersResult.error
  ) {
    return err(ErrorCode.DataExportFailed, "Failed to export data");
  }

  const exportData: UserDataExport = {
    exported_at: new Date().toISOString(),
    app_version: "my-budget-v1",
    tables: {
      accounts: (accountsResult.data ?? []) as Record<string, unknown>[],
      categories: (categoriesResult.data ?? []) as Record<string, unknown>[],
      transactions: (transactionsResult.data ?? []) as Record<
        string,
        unknown
      >[],
      budgets: (budgetsResult.data ?? []) as Record<string, unknown>[],
      budget_categories: (budgetCategoriesResult.data ?? []) as Record<
        string,
        unknown
      >[],
      goals: (goalsResult.data ?? []) as Record<string, unknown>[],
      goal_contributions: (goalContributionsResult.data ?? []) as Record<
        string,
        unknown
      >[],
      macros: (macrosResult.data ?? []) as Record<string, unknown>[],
      transfers: (transfersResult.data ?? []) as Record<string, unknown>[],
    },
  };

  return ok(exportData);
}
