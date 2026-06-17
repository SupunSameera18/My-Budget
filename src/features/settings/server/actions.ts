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

  const tableErrors: string[] = [
    accountsResult.error && `accounts: ${accountsResult.error.message}`,
    categoriesResult.error && `categories: ${categoriesResult.error.message}`,
    transactionsResult.error &&
      `transactions: ${transactionsResult.error.message}`,
    budgetsResult.error && `budgets: ${budgetsResult.error.message}`,
    budgetCategoriesResult.error &&
      `budget_categories: ${budgetCategoriesResult.error.message}`,
    goalsResult.error && `goals: ${goalsResult.error.message}`,
    goalContributionsResult.error &&
      `goal_contributions: ${goalContributionsResult.error.message}`,
    macrosResult.error && `macros: ${macrosResult.error.message}`,
    transfersResult.error && `transfers: ${transfersResult.error.message}`,
  ].filter(Boolean) as string[];

  if (tableErrors.length > 0) {
    console.error("[getAllUserData] fetch failures:", tableErrors.join("; "));
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
