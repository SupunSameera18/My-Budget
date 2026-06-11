export interface UserDataExport {
  exported_at: string;
  app_version: string;
  tables: {
    accounts: Record<string, unknown>[];
    categories: Record<string, unknown>[];
    transactions: Record<string, unknown>[];
    budgets: Record<string, unknown>[];
    budget_categories: Record<string, unknown>[];
    goals: Record<string, unknown>[];
    goal_contributions: Record<string, unknown>[];
    macros: Record<string, unknown>[];
    transfers: Record<string, unknown>[];
  };
}
