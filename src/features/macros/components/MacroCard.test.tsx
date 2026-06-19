import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { ok, err, ErrorCode } from "@/lib/errors";

vi.mock("@/features/macros/server/actions", () => ({
  updateMacro: vi.fn(),
  archiveMacro: vi.fn(),
}));

vi.mock("@/lib/format", () => ({
  formatMoney: vi.fn((minor: number, currency: string) => {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }),
}));

import { MacroCard } from "./MacroCard";
import { updateMacro, archiveMacro } from "@/features/macros/server/actions";
import type { MacroWithTarget } from "@/features/macros/schema";

const accountMacro: MacroWithTarget = {
  id: "macro-1",
  user_id: "user-1",
  name: "Netflix",
  amount_minor: 1500,
  account_id: "account-1",
  goal_id: null,
  category_id: "cat-1",
  last_used_at: null,
  archived_at: null,
  created_at: "2026-06-01T00:00:00Z",
  account_name: "Checking",
  goal_name: null,
  category_name: "Entertainment",
};

const goalMacro: MacroWithTarget = {
  id: "macro-2",
  user_id: "user-1",
  name: "Vacation Save",
  amount_minor: 5000,
  account_id: null,
  goal_id: "goal-1",
  category_id: null,
  last_used_at: null,
  archived_at: null,
  created_at: "2026-06-01T00:00:00Z",
  account_name: null,
  goal_name: "Vacation Fund",
  category_name: null,
};

const mockAccounts = [{ id: "account-1", name: "Checking" }];
const mockGoals = [{ id: "goal-1", name: "Vacation Fund" }];
const mockCategories = [
  { id: "cat-1", name: "Entertainment", type: "expense" },
];

describe("MacroCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (updateMacro as Mock).mockResolvedValue(ok());
    (archiveMacro as Mock).mockResolvedValue(ok());
  });

  it("renders macro name, formatted amount, account target, and category", () => {
    render(
      <MacroCard
        macro={accountMacro}
        currency="USD"
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    expect(screen.getByText("Netflix")).toBeTruthy();
    expect(screen.getByText(/15\.00/)).toBeTruthy();
    expect(screen.getByText(/Account: Checking/i)).toBeTruthy();
    expect(screen.getByText(/Entertainment/i)).toBeTruthy();
  });

  it("renders goal target label for goal-targeted macro", () => {
    render(
      <MacroCard
        macro={goalMacro}
        currency="USD"
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    expect(screen.getByText(/Goal: Vacation Fund/i)).toBeTruthy();
  });

  it("does not render category label for goal-targeted macro", () => {
    render(
      <MacroCard
        macro={goalMacro}
        currency="USD"
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    expect(screen.queryByText(/Entertainment/i)).toBeNull();
  });

  it("shows Edit and Archive buttons in default view", () => {
    render(
      <MacroCard
        macro={accountMacro}
        currency="USD"
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    expect(screen.getByRole("button", { name: /edit/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /archive/i })).toBeTruthy();
  });

  it("Edit button toggles to inline edit form", () => {
    render(
      <MacroCard
        macro={accountMacro}
        currency="USD"
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByRole("button", { name: /save/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
  });

  it("edit form hides category when target switched to Goal", () => {
    render(
      <MacroCard
        macro={accountMacro}
        currency="USD"
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    const goalRadio = screen
      .getAllByRole("radio")
      .find((r) => (r as HTMLInputElement).value === "goal")!;
    fireEvent.click(goalRadio);
    expect(screen.queryByLabelText(/category/i)).toBeNull();
  });

  it("edit form submits and closes on success", async () => {
    render(
      <MacroCard
        macro={accountMacro}
        currency="USD"
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => {
      expect(updateMacro).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /edit/i })).toBeTruthy();
    });
  });

  it("edit form shows error message on action failure", async () => {
    (updateMacro as Mock).mockResolvedValue(
      err(ErrorCode.MacroUpdateFailed, "Update failed"),
    );
    render(
      <MacroCard
        macro={accountMacro}
        currency="USD"
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => {
      expect(screen.getByText(/Update failed/i)).toBeTruthy();
    });
  });

  it("Archive button shows inline confirmation", () => {
    render(
      <MacroCard
        macro={accountMacro}
        currency="USD"
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /archive/i }));
    expect(screen.getByText(/Archive this macro/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
  });

  it("Confirm archive calls archiveMacro", async () => {
    render(
      <MacroCard
        macro={accountMacro}
        currency="USD"
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /archive/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => {
      expect(archiveMacro).toHaveBeenCalledWith("macro-1");
    });
  });

  it("Cancel archive dismisses confirmation without calling archiveMacro", () => {
    render(
      <MacroCard
        macro={accountMacro}
        currency="USD"
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /archive/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(archiveMacro).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /archive/i })).toBeTruthy();
  });

  it("edit form shows 'No accounts yet' when accounts list is empty and target switched to account", () => {
    render(
      <MacroCard
        macro={goalMacro}
        currency="USD"
        accounts={[]}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    const accountRadio = screen
      .getAllByRole("radio")
      .find((r) => (r as HTMLInputElement).value === "account")!;
    fireEvent.click(accountRadio);
    expect(screen.getByText(/No accounts yet/i)).toBeTruthy();
  });

  it("edit form shows 'No goals yet' when goals list is empty and target switched to goal", () => {
    render(
      <MacroCard
        macro={accountMacro}
        currency="USD"
        accounts={mockAccounts}
        goals={[]}
        categories={mockCategories}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    const goalRadio = screen
      .getAllByRole("radio")
      .find((r) => (r as HTMLInputElement).value === "goal")!;
    fireEvent.click(goalRadio);
    expect(screen.getByText(/No goals yet/i)).toBeTruthy();
  });

  it("ARIA live region has both aria-live and role attributes", () => {
    render(
      <MacroCard
        macro={accountMacro}
        currency="USD"
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toBeTruthy();
    expect(liveRegion.getAttribute("aria-live")).toBe("polite");
  });
});
