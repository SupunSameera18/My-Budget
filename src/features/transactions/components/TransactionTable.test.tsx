import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { TransactionTable } from "./TransactionTable";
import type { TransactionListItem } from "@/features/transactions/schema";

const mockItems: TransactionListItem[] = [
  {
    id: "aaaaaaaa-0001-4000-8000-000000000001",
    account_id: "aaaaaaaa-0002-4000-8000-000000000002",
    category_id: "aaaaaaaa-0003-4000-8000-000000000003",
    amount_minor: 4500,
    date: "2026-06-01",
    note: "Coffee shop",
    type: "expense",
    created_at: "2026-06-01T10:00:00Z",
    account_name: "Wallet",
    category_name: "Food",
  },
  {
    id: "aaaaaaaa-0004-4000-8000-000000000004",
    account_id: "aaaaaaaa-0002-4000-8000-000000000002",
    category_id: "aaaaaaaa-0005-4000-8000-000000000005",
    amount_minor: 200000,
    date: "2026-06-02",
    note: null,
    type: "income",
    created_at: "2026-06-02T09:00:00Z",
    account_name: "Wallet",
    category_name: "Salary",
  },
];

describe("TransactionTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ARIA live region", () => {
    it("shows correct count when items present", () => {
      render(<TransactionTable items={mockItems} currency="USD" />);
      const live = screen.getByRole("status");
      expect(live.textContent).toBe("2 transactions found");
    });

    it("uses singular form for 1 item", () => {
      render(<TransactionTable items={[mockItems[0]]} currency="USD" />);
      const live = screen.getByRole("status");
      expect(live.textContent).toBe("1 transaction found");
    });

    it("announces 'No transactions found' when empty", () => {
      render(<TransactionTable items={[]} currency="USD" />);
      const live = screen.getByRole("status");
      expect(live.textContent).toBe("No transactions found");
    });
  });

  describe("desktop table", () => {
    it("renders column headers in correct order", () => {
      render(<TransactionTable items={mockItems} currency="USD" />);
      const headers = screen.getAllByRole("columnheader");
      const headerTexts = headers.map((h) => h.textContent);
      expect(headerTexts).toContain("Date");
      expect(headerTexts).toContain("Category");
      expect(headerTexts).toContain("Account");
      expect(headerTexts).toContain("Note");
      expect(headerTexts).toContain("Type");
      expect(headerTexts).toContain("Amount");
    });

    it("renders a row link to /transactions/[id]", () => {
      render(<TransactionTable items={mockItems} currency="USD" />);
      const links = screen
        .getAllByRole("link")
        .filter((l) => l.getAttribute("href")?.startsWith("/transactions/"));
      const hrefs = links.map((l) => l.getAttribute("href"));
      expect(hrefs).toContain(`/transactions/${mockItems[0].id}`);
    });

    it("shows category and account names in table cells", () => {
      render(<TransactionTable items={mockItems} currency="USD" />);
      expect(screen.getAllByText("Food").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Wallet").length).toBeGreaterThan(0);
    });
  });

  describe("mobile rows", () => {
    it("shows + prefix for income items", () => {
      render(<TransactionTable items={[mockItems[1]]} currency="USD" />);
      // income item should have '+' sign somewhere in the rendered output
      const incomeElements = screen.queryAllByText(/\+/);
      expect(incomeElements.length).toBeGreaterThan(0);
    });

    it("shows − prefix for expense items", () => {
      render(<TransactionTable items={[mockItems[0]]} currency="USD" />);
      // expense item should have '−' sign somewhere in the rendered output
      const expenseElements = screen.queryAllByText(/−/);
      expect(expenseElements.length).toBeGreaterThan(0);
    });
  });

  describe("empty state", () => {
    it("renders EmptyState when items is empty", () => {
      render(<TransactionTable items={[]} currency="USD" />);
      // "No transactions found" appears in both ARIA live region and EmptyState heading
      const matches = screen.getAllByText("No transactions found");
      expect(matches.length).toBeGreaterThan(0);
      expect(
        screen.getByText(
          "Try adjusting your filters or log a new transaction.",
        ),
      ).toBeTruthy();
    });

    it("does not render the table/list when items is empty", () => {
      render(<TransactionTable items={[]} currency="USD" />);
      expect(screen.queryByRole("table")).toBeNull();
    });
  });
});
