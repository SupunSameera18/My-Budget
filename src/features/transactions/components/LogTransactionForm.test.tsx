import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Subcategory } from "@/features/categories/schema";
import type { Account } from "@/features/accounts/schema";
import type { TransactionCategory } from "@/features/transactions/schema";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/features/transactions/server/actions", () => ({
  logTransaction: vi.fn(),
}));

vi.mock("@/lib/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => true,
}));

vi.mock("@/components/feedback/OfflineRetryBanner", () => ({
  OfflineRetryBanner: () => null,
}));

import { LogTransactionForm } from "./LogTransactionForm";

const mockAccounts: Account[] = [{ id: "acc-1", name: "Checking" } as Account];

const mockCategories: TransactionCategory[] = [
  { id: "cat-expense", name: "Groceries", type: "expense" },
  { id: "cat-income", name: "Salary", type: "income" },
];

const mockSubcategories: Subcategory[] = [
  {
    id: "sub-1",
    user_id: "u1",
    category_id: "cat-expense",
    name: "Produce",
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "sub-2",
    user_id: "u1",
    category_id: "cat-expense",
    name: "Meat",
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const baseProps = {
  accounts: mockAccounts,
  categories: mockCategories,
  defaultAccountId: "acc-1",
  currency: "USD",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("LogTransactionForm — subcategory picker", () => {
  it("does not render subcategory picker when subcategoriesEnabled=false", () => {
    render(
      <LogTransactionForm
        {...baseProps}
        subcategoriesEnabled={false}
        subcategories={mockSubcategories}
      />,
    );
    expect(screen.queryByLabelText(/subcategory/i)).toBeNull();
  });

  it("does not render subcategory picker before a category is selected", () => {
    render(
      <LogTransactionForm
        {...baseProps}
        subcategoriesEnabled={true}
        subcategories={mockSubcategories}
      />,
    );
    expect(screen.queryByLabelText(/subcategory/i)).toBeNull();
  });

  it("does not render picker when selected category has no subcategories", async () => {
    render(
      <LogTransactionForm
        {...baseProps}
        subcategoriesEnabled={true}
        subcategories={mockSubcategories}
      />,
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Category"),
      "cat-income",
    );
    expect(screen.queryByLabelText(/subcategory/i)).toBeNull();
  });

  it("renders subcategory picker after selecting a category with subcategories", async () => {
    render(
      <LogTransactionForm
        {...baseProps}
        subcategoriesEnabled={true}
        subcategories={mockSubcategories}
      />,
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Category"),
      "cat-expense",
    );
    expect(screen.getByLabelText(/subcategory/i)).toBeInTheDocument();
    expect(screen.getByText("Produce")).toBeInTheDocument();
    expect(screen.getByText("Meat")).toBeInTheDocument();
  });

  it("includes 'None' as the first option in the subcategory picker", async () => {
    render(
      <LogTransactionForm
        {...baseProps}
        subcategoriesEnabled={true}
        subcategories={mockSubcategories}
      />,
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Category"),
      "cat-expense",
    );
    const subcatSelect = screen.getByLabelText(
      /subcategory/i,
    ) as HTMLSelectElement;
    expect(subcatSelect.options[0].text).toBe("None");
    expect(subcatSelect.options[0].value).toBe("");
  });

  it("hides subcategory picker when switching to a category with no subcategories", async () => {
    render(
      <LogTransactionForm
        {...baseProps}
        subcategoriesEnabled={true}
        subcategories={mockSubcategories}
      />,
    );
    const categorySelect = screen.getByLabelText("Category");
    await userEvent.selectOptions(categorySelect, "cat-expense");
    expect(screen.getByLabelText(/subcategory/i)).toBeInTheDocument();
    await userEvent.selectOptions(categorySelect, "cat-income");
    expect(screen.queryByLabelText(/subcategory/i)).toBeNull();
  });
});
