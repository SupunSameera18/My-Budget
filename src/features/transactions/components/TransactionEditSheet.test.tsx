import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import type { Account } from "@/features/accounts/schema";
import type { Subcategory } from "@/features/categories/schema";
import type {
  Transaction,
  TransactionCategory,
  ActivityTrailEntry,
} from "@/features/transactions/schema";
import { ok, err, ErrorCode } from "@/lib/errors";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: vi.fn() })),
  useParams: vi.fn(() => ({})),
}));

vi.mock("@/features/transactions/server/actions", () => ({
  editTransaction: vi.fn(),
  editSharedTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}));

vi.mock("@/lib/hooks/useOnlineStatus", () => ({
  useOnlineStatus: vi.fn(),
}));

import { TransactionEditSheet } from "./TransactionEditSheet";
import {
  editTransaction,
  editSharedTransaction,
  deleteTransaction,
} from "@/features/transactions/server/actions";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";
import { useRouter } from "next/navigation";

const mockTransaction: Transaction = {
  id: "txn-abc-123",
  user_id: "user-1",
  account_id: "acc-1",
  category_id: "cat-expense",
  subcategory_id: null,
  amount_minor: 3500,
  date: "2026-06-01",
  note: "Coffee",
  type: "expense",
  is_shared: false,
  created_at: "2026-06-01T10:00:00Z",
  updated_at: "2026-06-01T10:00:00Z",
  archived_at: null,
};

const mockAccounts: Account[] = [
  { id: "acc-1", name: "Checking" } as Account,
  { id: "acc-2", name: "Savings" } as Account,
];

const mockCategories: TransactionCategory[] = [
  { id: "cat-expense", name: "Groceries", type: "expense" },
  { id: "cat-income", name: "Salary", type: "income" },
];

const mockSubcategories: Subcategory[] = [
  {
    id: "sub-1",
    user_id: "user-1",
    category_id: "cat-expense",
    name: "Produce",
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const mockTrailEntry: ActivityTrailEntry = {
  id: "trail-1",
  user_id: "user-1",
  transaction_id: "txn-abc-123",
  change_type: "edit",
  changed_fields: { amount_minor: { old: 3000, new: 3500 } },
  created_at: "2026-06-02T12:00:00Z",
};

const baseProps = {
  transaction: mockTransaction,
  accounts: mockAccounts,
  categories: mockCategories,
  currency: "USD",
  subcategoriesEnabled: false,
  subcategories: mockSubcategories,
  activityTrail: [],
  viewerUserId: "user-1",
};

const sharedTransaction: Transaction = {
  ...mockTransaction,
  is_shared: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  (useOnlineStatus as Mock).mockReturnValue(true);
  (editTransaction as Mock).mockResolvedValue(ok());
  (editSharedTransaction as Mock).mockResolvedValue(ok());
  (deleteTransaction as Mock).mockResolvedValue(ok());
  (useRouter as Mock).mockReturnValue({ push: vi.fn(), refresh: vi.fn() });
});

describe("TransactionEditSheet — pre-filled fields", () => {
  it("renders pre-filled amount, account, category, date, and note from transaction prop", () => {
    render(<TransactionEditSheet {...baseProps} />);
    expect(screen.getByLabelText(/amount/i)).toHaveValue("35.00");
    expect(screen.getByLabelText(/account/i)).toHaveValue("acc-1");
    expect(screen.getByLabelText(/category/i)).toHaveValue("cat-expense");
    expect(screen.getByLabelText(/date/i)).toHaveValue("2026-06-01");
    expect(screen.getByLabelText(/note/i)).toHaveValue("Coffee");
  });
});

describe("TransactionEditSheet — save flow", () => {
  it("calls editTransaction with the transaction id when Save is clicked", async () => {
    render(<TransactionEditSheet {...baseProps} />);
    await userEvent.click(
      screen.getByRole("button", { name: /save changes/i }),
    );
    await waitFor(() => {
      expect(editTransaction as Mock).toHaveBeenCalledWith(
        "txn-abc-123",
        expect.any(FormData),
      );
    });
  });

  it("shows ARIA live message 'Transaction updated' after successful save", async () => {
    render(<TransactionEditSheet {...baseProps} />);
    await userEvent.click(
      screen.getByRole("button", { name: /save changes/i }),
    );
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Transaction updated",
      );
    });
  });

  it("shows ARIA live message 'Save failed: ...' when editTransaction returns err", async () => {
    (editTransaction as Mock).mockResolvedValue(
      err(ErrorCode.TransactionUpdateFailed, "RPC error"),
    );
    render(<TransactionEditSheet {...baseProps} />);
    await userEvent.click(
      screen.getByRole("button", { name: /save changes/i }),
    );
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Save failed: RPC error",
      );
    });
  });
});

describe("TransactionEditSheet — delete flow", () => {
  it("shows confirm panel when Delete transaction is clicked, then calls deleteTransaction on Confirm", async () => {
    render(<TransactionEditSheet {...baseProps} />);
    await userEvent.click(
      screen.getByRole("button", { name: /delete transaction/i }),
    );
    expect(
      screen.getByText(/this will remove the transaction/i),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /confirm delete/i }),
    );
    await waitFor(() => {
      expect(deleteTransaction as Mock).toHaveBeenCalledWith("txn-abc-123");
    });
  });

  it("shows ARIA live message 'Transaction deleted' after successful delete", async () => {
    render(<TransactionEditSheet {...baseProps} />);
    await userEvent.click(
      screen.getByRole("button", { name: /delete transaction/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /confirm delete/i }),
    );
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Transaction deleted",
      );
    });
  });
});

describe("TransactionEditSheet — activity trail", () => {
  it("shows History section with entry details when activityTrail is non-empty", () => {
    render(
      <TransactionEditSheet {...baseProps} activityTrail={[mockTrailEntry]} />,
    );
    expect(
      screen.getByRole("heading", { name: /history/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/edited/i)).toBeInTheDocument();
    expect(screen.getByText(/amount_minor/i)).toBeInTheDocument();
  });

  it("does not show History section when activityTrail is empty", () => {
    render(<TransactionEditSheet {...baseProps} activityTrail={[]} />);
    expect(
      screen.queryByRole("heading", { name: /history/i }),
    ).not.toBeInTheDocument();
  });
});

describe("TransactionEditSheet — offline state", () => {
  it("disables Save button and shows offline message when offline", () => {
    (useOnlineStatus as Mock).mockReturnValue(false);
    render(<TransactionEditSheet {...baseProps} />);
    expect(
      screen.getByRole("button", { name: /save changes/i }),
    ).toBeDisabled();
    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
  });
});

describe("TransactionEditSheet — note clearing", () => {
  it("omits note from FormData when user clears the note field", async () => {
    render(<TransactionEditSheet {...baseProps} />);
    const noteInput = screen.getByLabelText(/note/i);
    await userEvent.clear(noteInput);
    await userEvent.click(
      screen.getByRole("button", { name: /save changes/i }),
    );
    await waitFor(() => {
      const fd: FormData = (editTransaction as Mock).mock.calls[0][1];
      expect(fd.get("note")).toBeNull();
    });
  });
});

describe("TransactionEditSheet — shared transaction", () => {
  it("disables the amount field for shared transactions", () => {
    render(
      <TransactionEditSheet
        {...baseProps}
        transaction={sharedTransaction}
        isShared
      />,
    );
    const amountInput = screen.getByLabelText(/amount/i);
    expect(amountInput).toBeDisabled();
    expect(amountInput).toHaveAttribute("aria-disabled", "true");
  });

  it("sets aria-describedby on amount field pointing to hint text for shared transactions", () => {
    render(
      <TransactionEditSheet
        {...baseProps}
        transaction={sharedTransaction}
        isShared
      />,
    );
    const amountInput = screen.getByLabelText(/amount/i);
    expect(amountInput).toHaveAttribute(
      "aria-describedby",
      "amount-readonly-hint",
    );
    expect(document.getElementById("amount-readonly-hint")).toBeInTheDocument();
  });

  it("does not disable amount field for personal transactions", () => {
    render(<TransactionEditSheet {...baseProps} />);
    expect(screen.getByLabelText(/amount/i)).not.toBeDisabled();
  });

  it("calls editSharedTransaction (not editTransaction) when saving a shared transaction", async () => {
    render(
      <TransactionEditSheet
        {...baseProps}
        transaction={sharedTransaction}
        isShared
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /save changes/i }),
    );
    await waitFor(() => {
      expect(editSharedTransaction as Mock).toHaveBeenCalledWith(
        sharedTransaction.id,
        expect.any(FormData),
      );
      expect(editTransaction as Mock).not.toHaveBeenCalled();
    });
  });

  it("shows 'You' for viewer's own trail entry and partnerName for partner's", () => {
    const viewerEntry: ActivityTrailEntry = {
      ...mockTrailEntry,
      id: "trail-viewer",
      user_id: "user-1",
    };
    const partnerEntry: ActivityTrailEntry = {
      ...mockTrailEntry,
      id: "trail-partner",
      user_id: "user-2",
    };
    render(
      <TransactionEditSheet
        {...baseProps}
        transaction={sharedTransaction}
        isShared
        partnerName="Bob"
        viewerUserId="user-1"
        activityTrail={[viewerEntry, partnerEntry]}
      />,
    );
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });
});
