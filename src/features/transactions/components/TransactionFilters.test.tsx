import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(""),
}));

import { TransactionFilters } from "./TransactionFilters";
import type {
  TransactionListFilterAccount,
  TransactionListFilterCategory,
} from "@/features/transactions/schema";

const mockAccounts: TransactionListFilterAccount[] = [
  {
    id: "aaaaaaaa-0001-4000-8000-000000000001",
    name: "Wallet",
    archived_at: null,
  },
  {
    id: "aaaaaaaa-0002-4000-8000-000000000002",
    name: "Savings",
    archived_at: "2026-01-01T00:00:00Z",
  },
];

const mockCategories: TransactionListFilterCategory[] = [
  {
    id: "aaaaaaaa-0003-4000-8000-000000000003",
    name: "Food",
    type: "expense",
    archived_at: null,
  },
  {
    id: "aaaaaaaa-0004-4000-8000-000000000004",
    name: "Salary",
    type: "income",
    archived_at: null,
  },
];

describe("TransactionFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders Account and Category selects with options", () => {
      render(
        <TransactionFilters
          accounts={mockAccounts}
          categories={mockCategories}
          currentFilters={{}}
        />,
      );
      expect(screen.getByLabelText("Account")).toBeTruthy();
      expect(screen.getByLabelText("Category")).toBeTruthy();
      expect(screen.getByText("Wallet")).toBeTruthy();
      expect(screen.getByText("Savings (archived)")).toBeTruthy();
      expect(screen.getByText("Food")).toBeTruthy();
      expect(screen.getByText("Salary")).toBeTruthy();
    });

    it("renders From and To date inputs", () => {
      render(
        <TransactionFilters
          accounts={mockAccounts}
          categories={mockCategories}
          currentFilters={{}}
        />,
      );
      expect(screen.getByLabelText("From")).toBeTruthy();
      expect(screen.getByLabelText("To")).toBeTruthy();
    });
  });

  describe("account filter", () => {
    it("selecting an account calls router.replace with account param", () => {
      render(
        <TransactionFilters
          accounts={mockAccounts}
          categories={mockCategories}
          currentFilters={{}}
        />,
      );
      fireEvent.change(screen.getByLabelText("Account"), {
        target: { value: mockAccounts[0].id },
      });
      expect(mockReplace).toHaveBeenCalledWith(
        `/transactions?account=${mockAccounts[0].id}`,
      );
    });

    it("clearing account select calls router.replace without account param", () => {
      render(
        <TransactionFilters
          accounts={mockAccounts}
          categories={mockCategories}
          currentFilters={{ account_id: mockAccounts[0].id }}
        />,
      );
      fireEvent.change(screen.getByLabelText("Account"), {
        target: { value: "" },
      });
      expect(mockReplace).toHaveBeenCalledWith("/transactions");
    });
  });

  describe("category filter", () => {
    it("selecting a category calls router.replace with category param", () => {
      render(
        <TransactionFilters
          accounts={mockAccounts}
          categories={mockCategories}
          currentFilters={{}}
        />,
      );
      fireEvent.change(screen.getByLabelText("Category"), {
        target: { value: mockCategories[0].id },
      });
      expect(mockReplace).toHaveBeenCalledWith(
        `/transactions?category=${mockCategories[0].id}`,
      );
    });
  });

  describe("Clear filters button", () => {
    it("is absent when no filters are active", () => {
      render(
        <TransactionFilters
          accounts={mockAccounts}
          categories={mockCategories}
          currentFilters={{}}
        />,
      );
      expect(
        screen.queryByRole("button", { name: /clear filters/i }),
      ).toBeNull();
    });

    it("appears when account_id filter is active", () => {
      render(
        <TransactionFilters
          accounts={mockAccounts}
          categories={mockCategories}
          currentFilters={{ account_id: mockAccounts[0].id }}
        />,
      );
      expect(
        screen.getByRole("button", { name: /clear filters/i }),
      ).toBeTruthy();
    });

    it("appears when showArchivedAccounts is active", () => {
      render(
        <TransactionFilters
          accounts={mockAccounts}
          categories={mockCategories}
          currentFilters={{ showArchivedAccounts: true }}
        />,
      );
      expect(
        screen.getByRole("button", { name: /clear filters/i }),
      ).toBeTruthy();
    });

    it("appears when showArchivedCategories is active", () => {
      render(
        <TransactionFilters
          accounts={mockAccounts}
          categories={mockCategories}
          currentFilters={{ showArchivedCategories: true }}
        />,
      );
      expect(
        screen.getByRole("button", { name: /clear filters/i }),
      ).toBeTruthy();
    });

    it("appears when from date filter is active", () => {
      render(
        <TransactionFilters
          accounts={mockAccounts}
          categories={mockCategories}
          currentFilters={{ from: "2026-06-01" }}
        />,
      );
      expect(
        screen.getByRole("button", { name: /clear filters/i }),
      ).toBeTruthy();
    });

    it("calls router.replace('/transactions') when clicked", () => {
      render(
        <TransactionFilters
          accounts={mockAccounts}
          categories={mockCategories}
          currentFilters={{ account_id: mockAccounts[0].id }}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
      expect(mockReplace).toHaveBeenCalledWith("/transactions");
    });
  });
});
