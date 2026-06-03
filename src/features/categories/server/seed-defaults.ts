export type CategoryType = "income" | "expense";

export interface DefaultCategory {
  name: string;
  type: CategoryType;
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // Income
  { name: "Salary", type: "income" },
  { name: "Freelance", type: "income" },
  { name: "Investment", type: "income" },
  { name: "Other Income", type: "income" },
  // Expense
  { name: "Housing", type: "expense" },
  { name: "Groceries", type: "expense" },
  { name: "Dining Out", type: "expense" },
  { name: "Transport", type: "expense" },
  { name: "Utilities", type: "expense" },
  { name: "Healthcare", type: "expense" },
  { name: "Entertainment", type: "expense" },
  { name: "Shopping", type: "expense" },
  { name: "Education", type: "expense" },
  { name: "Other", type: "expense" },
];
