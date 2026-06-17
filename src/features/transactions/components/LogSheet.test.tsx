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

vi.mock("@/features/macros/server/actions", () => ({
  applyMacro: vi.fn().mockResolvedValue({
    ok: true,
    data: { applicationId: "test-app-id" },
  }),
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
import { applyMacro } from "@/features/macros/server/actions";
import { getDefaultNotePrompt } from "@/lib/note-suggestions";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";
import type { MacroWithTarget } from "@/features/macros/schema";

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

const mockMacros: MacroWithTarget[] = [
  {
    id: "macro-1",
    user_id: "u1",
    name: "Netflix",
    amount_minor: 1500,
    account_id: "acc-1",
    goal_id: null,
    category_id: "cat-expense",
    last_used_at: "2026-06-10T10:00:00Z",
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    account_name: "Checking",
    goal_name: null,
    category_name: "Entertainment",
  },
  {
    id: "macro-2",
    user_id: "u1",
    name: "Spotify",
    amount_minor: 1000,
    account_id: "acc-1",
    goal_id: null,
    category_id: "cat-expense",
    last_used_at: null,
    archived_at: null,
    created_at: "2026-01-02T00:00:00Z",
    account_name: "Checking",
    goal_name: null,
    category_name: "Entertainment",
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  (useOnlineStatus as Mock).mockReturnValue(true);
  (getSuggestedNotes as Mock).mockResolvedValue([]);
  (getDefaultNotePrompt as Mock).mockReturnValue(null);
  (applyMacro as Mock).mockResolvedValue({
    ok: true,
    data: { applicationId: "test-app-id" },
  });
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

describe("LogSheet — macro chips", () => {
  async function goToStep2WithMacros(macros: MacroWithTarget[] = mockMacros) {
    render(<LogSheet {...baseProps} macros={macros} />);
    await userEvent.click(screen.getByRole("button", { name: "5" }));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
  }

  it("Quick Add section is hidden when macros prop is empty", async () => {
    render(<LogSheet {...baseProps} macros={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "5" }));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.queryByText(/quick add/i)).toBeNull();
  });

  it("Quick Add section is hidden when macros prop is omitted", async () => {
    render(<LogSheet {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: "5" }));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.queryByText(/quick add/i)).toBeNull();
  });

  it("renders macro chips with name and formatted amount", async () => {
    await goToStep2WithMacros();
    expect(
      screen.getByRole("button", { name: /netflix/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /spotify/i }),
    ).toBeInTheDocument();
    // Netflix chip shows formatted amount (1500 minor = $15.00)
    expect(
      screen.getByRole("button", { name: /netflix/i }).textContent,
    ).toContain("15");
  });

  it("chips are ordered MRU first (macro with last_used_at appears before null)", async () => {
    await goToStep2WithMacros();
    const buttons = screen.getAllByRole("button");
    const netflixIdx = buttons.findIndex((b) =>
      b.textContent?.includes("Netflix"),
    );
    const spotifyIdx = buttons.findIndex((b) =>
      b.textContent?.includes("Spotify"),
    );
    // Netflix has last_used_at, Spotify has null — Netflix should appear first
    expect(netflixIdx).toBeLessThan(spotifyIdx);
  });

  it("tapping a chip sets aria-pressed=true (selected)", async () => {
    await goToStep2WithMacros();
    const chip = screen.getByRole("button", { name: /netflix/i });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("tapping a selected chip deselects it (aria-pressed=false)", async () => {
    await goToStep2WithMacros();
    const chip = screen.getByRole("button", { name: /netflix/i });
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("Quick Add Summary appears when a macro chip is selected", async () => {
    await goToStep2WithMacros();
    expect(screen.queryByText(/quick add summary/i)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /netflix/i }));
    expect(screen.getByText(/quick add summary/i)).toBeInTheDocument();
  });

  it("Save button is enabled when no category selected but a macro chip is selected", async () => {
    await goToStep2WithMacros();
    // No category selected — save should be disabled
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    // Select a macro chip — save should become enabled
    await userEvent.click(screen.getByRole("button", { name: /netflix/i }));
    expect(screen.getByRole("button", { name: /^save$/i })).not.toBeDisabled();
  });

  it("Save button is disabled when no category AND no macros selected (and online)", async () => {
    await goToStep2WithMacros();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("submitForm calls applyMacro for each selected macro when no category selected", async () => {
    (logTransaction as Mock).mockResolvedValue({ ok: true, data: undefined });
    await goToStep2WithMacros();
    await userEvent.click(screen.getByRole("button", { name: /netflix/i }));
    await userEvent.click(screen.getByRole("button", { name: /spotify/i }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(applyMacro).toHaveBeenCalledTimes(2);
      expect(logTransaction).not.toHaveBeenCalled();
    });
  });

  it("submitForm calls logTransaction and applyMacro when category + macros selected", async () => {
    (logTransaction as Mock).mockResolvedValue({ ok: true, data: undefined });
    await goToStep2WithMacros();
    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    await userEvent.click(screen.getByRole("button", { name: /netflix/i }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(logTransaction).toHaveBeenCalledOnce();
      expect(applyMacro).toHaveBeenCalledOnce();
    });
  });

  it("if logTransaction fails, applyMacro is NOT called", async () => {
    (logTransaction as Mock).mockResolvedValue({
      ok: false,
      error: { code: "transaction_create_failed", message: "DB error" },
    });
    await goToStep2WithMacros();
    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    await userEvent.click(screen.getByRole("button", { name: /netflix/i }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(logTransaction).toHaveBeenCalledOnce();
      expect(applyMacro).not.toHaveBeenCalled();
    });
  });

  it("goal-targeted macro chip renders goal name as secondary label", async () => {
    const goalMacro: MacroWithTarget = {
      id: "macro-goal",
      user_id: "u1",
      name: "Vacation Save",
      amount_minor: 5000,
      account_id: null,
      goal_id: "goal-1",
      category_id: "cat-expense",
      last_used_at: null,
      archived_at: null,
      created_at: "2026-01-01T00:00:00Z",
      account_name: null,
      goal_name: "Vacation Fund",
      category_name: "Savings",
    };
    await goToStep2WithMacros([goalMacro]);
    expect(screen.getByText("Vacation Fund")).toBeInTheDocument();
  });

  it("account-targeted macro chip does NOT render a secondary label", async () => {
    await goToStep2WithMacros([mockMacros[0]]);
    // Only the primary line text should appear — no extra text below chip name/amount
    expect(screen.queryByText("Checking")).not.toBeInTheDocument();
    expect(screen.queryByText("Entertainment")).not.toBeInTheDocument();
  });
});

describe("LogSheet — Personal/Shared toggle (Story 7.5)", () => {
  async function goToStep2() {
    await userEvent.click(screen.getByRole("button", { name: "5" }));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
  }

  it("toggle is hidden in single-user mode (isFamilyMode=false)", async () => {
    render(<LogSheet {...baseProps} isFamilyMode={false} />);
    await goToStep2();
    // The radiogroup is in the DOM (preserve form state — AC: hide content, not unmount).
    // jsdom does not apply browser-default display:none for the `hidden` attribute, so
    // we assert the wrapper has the `hidden` attribute directly rather than toBeVisible().
    // Use hidden:true so @testing-library searches inside the hidden subtree
    const group = screen.queryByRole("radiogroup", {
      name: /transaction type/i,
      hidden: true,
    });
    expect(group).toBeInTheDocument();
    expect(group?.parentElement).toHaveAttribute("hidden");
  });

  it("toggle is visible in family mode (isFamilyMode=true)", async () => {
    render(<LogSheet {...baseProps} isFamilyMode={true} />);
    await goToStep2();
    const personalBtn = screen.getByRole("radio", { name: /personal/i });
    const sharedBtn = screen.getByRole("radio", { name: /shared/i });
    expect(personalBtn).toBeVisible();
    expect(sharedBtn).toBeVisible();
  });

  it("defaults to Personal when transactionDefaults is null", async () => {
    render(
      <LogSheet
        {...baseProps}
        isFamilyMode={true}
        transactionDefaults={null}
      />,
    );
    await goToStep2();
    const personalBtn = screen.getByRole("radio", { name: /personal/i });
    const sharedBtn = screen.getByRole("radio", { name: /shared/i });
    expect(personalBtn).toHaveAttribute("aria-checked", "true");
    expect(sharedBtn).toHaveAttribute("aria-checked", "false");
  });

  it("defaults to Shared when transactionDefaults.defaultType is 'shared'", async () => {
    render(
      <LogSheet
        {...baseProps}
        isFamilyMode={true}
        transactionDefaults={{ defaultType: "shared" }}
      />,
    );
    await goToStep2();
    const personalBtn = screen.getByRole("radio", { name: /personal/i });
    const sharedBtn = screen.getByRole("radio", { name: /shared/i });
    expect(sharedBtn).toHaveAttribute("aria-checked", "true");
    expect(personalBtn).toHaveAttribute("aria-checked", "false");
  });

  it("tapping Shared sets it active; tapping Personal reverts", async () => {
    render(<LogSheet {...baseProps} isFamilyMode={true} />);
    await goToStep2();
    const personalBtn = screen.getByRole("radio", { name: /personal/i });
    const sharedBtn = screen.getByRole("radio", { name: /shared/i });
    await userEvent.click(sharedBtn);
    expect(sharedBtn).toHaveAttribute("aria-checked", "true");
    expect(personalBtn).toHaveAttribute("aria-checked", "false");
    await userEvent.click(personalBtn);
    expect(personalBtn).toHaveAttribute("aria-checked", "true");
    expect(sharedBtn).toHaveAttribute("aria-checked", "false");
  });

  it("passes is_shared=true in FormData when Shared is selected", async () => {
    (logTransaction as Mock).mockResolvedValue({ ok: true, data: undefined });
    render(
      <LogSheet
        {...baseProps}
        isFamilyMode={true}
        transactionDefaults={null}
      />,
    );
    await goToStep2();
    // Select Shared
    await userEvent.click(screen.getByRole("radio", { name: /shared/i }));
    // Select a category so Save is enabled
    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(logTransaction).toHaveBeenCalledOnce();
      const fd = (logTransaction as Mock).mock.calls[0][0] as FormData;
      expect(fd.get("is_shared")).toBe("true");
    });
  });

  it("omits is_shared from FormData when Personal is selected", async () => {
    (logTransaction as Mock).mockResolvedValue({ ok: true, data: undefined });
    render(
      <LogSheet
        {...baseProps}
        isFamilyMode={true}
        transactionDefaults={{ defaultType: "shared" }}
      />,
    );
    await goToStep2();
    // Start Shared, switch to Personal
    await userEvent.click(screen.getByRole("radio", { name: /personal/i }));
    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      const fd = (logTransaction as Mock).mock.calls[0][0] as FormData;
      expect(fd.get("is_shared")).toBeNull();
    });
  });

  it("Personal radio has tabIndex=0; Shared radio has tabIndex=-1 when Personal is selected (roving tabindex)", async () => {
    render(<LogSheet {...baseProps} isFamilyMode={true} />);
    await goToStep2();
    const personalBtn = screen.getByRole("radio", { name: /personal/i });
    const sharedBtn = screen.getByRole("radio", { name: /shared/i });
    expect(personalBtn).toHaveAttribute("tabIndex", "0");
    expect(sharedBtn).toHaveAttribute("tabIndex", "-1");
  });

  it("ArrowRight on Personal/Shared radiogroup switches to Shared", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(<LogSheet {...baseProps} isFamilyMode={true} />);
    await goToStep2();
    const personalBtn = screen.getByRole("radio", { name: /personal/i });
    const sharedBtn = screen.getByRole("radio", { name: /shared/i });
    personalBtn.focus();
    fireEvent.keyDown(personalBtn.parentElement!, { key: "ArrowRight" });
    expect(sharedBtn).toHaveAttribute("aria-checked", "true");
    expect(personalBtn).toHaveAttribute("aria-checked", "false");
  });

  it("ArrowLeft on Personal/Shared radiogroup when Shared is active switches to Personal", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(
      <LogSheet
        {...baseProps}
        isFamilyMode={true}
        transactionDefaults={{ defaultType: "shared" }}
      />,
    );
    await goToStep2();
    const personalBtn = screen.getByRole("radio", { name: /personal/i });
    const sharedBtn = screen.getByRole("radio", { name: /shared/i });
    sharedBtn.focus();
    fireEvent.keyDown(sharedBtn.parentElement!, { key: "ArrowLeft" });
    expect(personalBtn).toHaveAttribute("aria-checked", "true");
    expect(sharedBtn).toHaveAttribute("aria-checked", "false");
  });
});
