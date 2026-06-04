export type ChecklistItemId =
  | "log_transaction"
  | "create_budget"
  | "set_goal"
  | "invite_partner";

export type ChecklistItem = {
  id: ChecklistItemId;
  label: string;
  href: string;
  done: boolean;
};

export type ChecklistParams = {
  transactionCount: number;
  budgetCount: number;
  goalCount: number;
  familyMemberCount: number;
};

export type DashboardProfile = {
  user_id: string;
  display_name: string | null;
  checklist_completed_at: string | null;
};

export function deriveChecklistState(params: ChecklistParams): ChecklistItem[] {
  return [
    {
      id: "log_transaction",
      label: "Log your first transaction",
      href: "/transactions/new",
      done: params.transactionCount > 0,
    },
    {
      id: "create_budget",
      label: "Create a budget",
      href: "/budgets",
      done: params.budgetCount > 0,
    },
    {
      id: "set_goal",
      label: "Set a goal",
      href: "/goals",
      done: params.goalCount > 0,
    },
    {
      id: "invite_partner",
      label: "Invite your partner",
      href: "/family",
      done: params.familyMemberCount > 1,
    },
  ];
}

export function isChecklistComplete(items: ChecklistItem[]): boolean {
  return items.every((item) => item.done);
}
