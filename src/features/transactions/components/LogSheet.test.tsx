import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import type { Subcategory } from "@/features/categories/schema";
import type { Account } from "@/features/accounts/schema";
import type { TransactionCategory } from "@/features/transactions/schema";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/features/transactions/server/actions", () => ({
  logTransaction: vi.fn(),
  getSuggestedNotes: vi.fn(),
}));

vi.mock("@/lib/note-suggestions", () => ({
  getDefaultNotePrompt: vi.fn(),
  dedupeRecentNotes: vi.fn((rows: Array<{ note: string | null }>) =>
    rows
      .filter((r) => r.note !== null)
      .map((r) => r.note as string)
      .slice(0, 5),
  ),
}));

vi.mock("@/lib/hooks/useOnlineStatus", () => ({
  useOnlineStatus: vi.fn(),
}));

vi.mock("@/components/feedback/OfflineRetryBanner", () => ({
  OfflineRetryBanner: () => null,
}));

import { LogSheet } from "./LogSheet";
import {
  logTransaction,
  getSuggestedNotes,
} from "@/features/transactions/server/actions";
import { getDefaultNotePrompt } from "@/lib/note-suggestions";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";

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
  subcategoriesEnabled: false,
  subcategories: mockSubcategories,
  currentBreathingRoomMinor: 50000,
};

beforeEach(() => {
  vi.resetAllMocks();
  (useOnlineStatus as Mock).mockReturnValue(true);
  (getSuggestedNotes as Mock).mockResolvedValue([]);
  (getDefaultNotePrompt as Mock).mockReturnValue(null);
});

describe("LogSheet — step 1", () => {
  it("renders number pad and Continue button on step 1", () => {
    render(<LogSheet {...baseProps} />);
    expect(
      screen.getByRole("button", { name: /continue/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: /number pad/i }),
    ).toBeInTheDocument();
  });

  it("Continue button is disabled when amount is '0'", () => {
    render(<LogSheet {...baseProps} />);
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("Continue button enables after tapping a digit", async () => {
    render(<LogSheet {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: "4" }));
    expect(
      screen.getByRole("button", { name: /continue/i }),
    ).not.toBeDisabled();
  });

  it("tapping Continue when amount > 0 advances to step 2", async () => {
    render(<LogSheet {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: "4" }));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /category/i }),
    ).toBeInTheDocument();
  });
});

describe("LogSheet — step 2", () => {
  async function goToStep2() {
    render(<LogSheet {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: "5" }));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
  }

  it("renders category buttons in expense and income sections", async () => {
    await goToStep2();
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("Salary")).toBeInTheDocument();
  });

  it("Save button is disabled when no category is selected", async () => {
    await goToStep2();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("tapping a category enables Save button", async () => {
    await goToStep2();
    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    expect(screen.getByRole("button", { name: /^save$/i })).not.toBeDisabled();
  });

  it("Back button returns to step 1, preserving amount", async () => {
    render(<LogSheet {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: "4" }));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    await userEvent.click(screen.getByRole("button", { name: /← back/i }));
    expect(
      screen.getByRole("button", { name: /continue/i }),
    ).toBeInTheDocument();
    // The amount display paragraph (aria-live) should contain "4"
    const amountDisplay = document.querySelector("[aria-live='polite']");
    expect(amountDisplay?.textContent).toContain("4");
  });

  it("successful save calls logTransaction", async () => {
    (logTransaction as Mock).mockResolvedValue({ ok: true, data: undefined });

    await goToStep2();
    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(logTransaction).toHaveBeenCalledOnce();
    });
  });

  it("error from logTransaction shows error message in alert", async () => {
    (logTransaction as Mock).mockResolvedValue({
      ok: false,
      error: {
        code: "transaction_create_failed",
        message: "Failed to save",
      },
    });

    await goToStep2();
    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/failed to save/i)).toBeInTheDocument();
    });
  });
});

describe("LogSheet — subcategory picker", () => {
  async function goToStep2WithSubcats(enabled: boolean) {
    render(
      <LogSheet
        {...baseProps}
        subcategoriesEnabled={enabled}
        subcategories={mockSubcategories}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "5" }));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
  }

  it("subcategory picker appears when subcategoriesEnabled=true and expense category with subcategories is selected", async () => {
    await goToStep2WithSubcats(true);
    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    expect(screen.getByLabelText(/subcategory/i)).toBeInTheDocument();
    expect(screen.getByText("Produce")).toBeInTheDocument();
    expect(screen.getByText("Meat")).toBeInTheDocument();
  });

  it("subcategory picker hidden when subcategoriesEnabled=false", async () => {
    await goToStep2WithSubcats(false);
    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    expect(screen.queryByLabelText(/subcategory/i)).toBeNull();
  });

  it("subcategory picker hidden when selected category has no subcategories (income)", async () => {
    await goToStep2WithSubcats(true);
    await userEvent.click(screen.getByRole("button", { name: "Salary" }));
    expect(screen.queryByLabelText(/subcategory/i)).toBeNull();
  });

  it("subcategory picker includes 'None' as first option", async () => {
    await goToStep2WithSubcats(true);
    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    const subcatSelect = screen.getByLabelText(
      /subcategory/i,
    ) as HTMLSelectElement;
    expect(subcatSelect.options[0].text).toBe("None");
    expect(subcatSelect.options[0].value).toBe("");
  });
});

describe("LogSheet — offline guard", () => {
  it("Save button is disabled when offline", async () => {
    (useOnlineStatus as Mock).mockReturnValue(false);
    render(<LogSheet {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: "5" }));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });
});

describe("LogSheet — note suggestions", () => {
  async function goToStep2() {
    render(<LogSheet {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: "5" }));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
  }

  it("renders suggestion chips when getSuggestedNotes returns notes", async () => {
    (getSuggestedNotes as Mock).mockResolvedValueOnce(["Coffee", "Latte"]);
    await goToStep2();
    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Coffee" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Latte" })).toBeInTheDocument();
  });

  it("tapping a suggestion chip sets the note field value", async () => {
    (getSuggestedNotes as Mock).mockResolvedValueOnce(["Coffee"]);
    await goToStep2();
    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    await act(async () => {});
    await userEvent.click(screen.getByRole("button", { name: "Coffee" }));
    expect(screen.getByLabelText(/note/i)).toHaveValue("Coffee");
  });

  it("renders no chips when getSuggestedNotes returns []", async () => {
    await goToStep2();
    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    await act(async () => {});
    expect(screen.queryByText(/previous notes/i)).toBeNull();
  });

  it("does not call getSuggestedNotes when offline", async () => {
    (useOnlineStatus as Mock).mockReturnValue(false);
    await goToStep2();
    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    await act(async () => {});
    expect(getSuggestedNotes).not.toHaveBeenCalled();
  });

  it("shows note placeholder from getDefaultNotePrompt when no suggestions", async () => {
    (getDefaultNotePrompt as Mock).mockReturnValue("Where did you eat?");
    await goToStep2();
    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    await act(async () => {});
    expect(screen.getByLabelText(/note/i)).toHaveAttribute(
      "placeholder",
      "Where did you eat?",
    );
  });
});
