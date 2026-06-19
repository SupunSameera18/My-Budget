import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { ok, err, ErrorCode } from "@/lib/errors";

vi.mock("@/features/macros/server/actions", () => ({
  createMacro: vi.fn(),
}));

import { CreateMacroForm } from "./CreateMacroForm";
import { createMacro } from "@/features/macros/server/actions";

const mockAccounts = [
  { id: "account-1", name: "Checking" },
  { id: "account-2", name: "Savings" },
];
const mockGoals = [{ id: "goal-1", name: "Vacation Fund" }];
const mockCategories = [
  { id: "cat-1", name: "Entertainment", type: "expense" },
  { id: "cat-2", name: "Salary", type: "income" },
];

describe("CreateMacroForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createMacro as Mock).mockResolvedValue(ok({ id: "new-macro-id" }));
  });

  it("renders name input, amount input, target type radio, and category when account type", () => {
    render(
      <CreateMacroForm
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    expect(screen.getByLabelText(/name/i)).toBeTruthy();
    expect(screen.getByLabelText(/amount/i)).toBeTruthy();
    // Category is visible for account type (default)
    expect(screen.getByLabelText(/category/i)).toBeTruthy();
    expect(
      screen.getByLabelText(/account/i, { selector: 'input[type="radio"]' }),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(/goal/i, { selector: 'input[type="radio"]' }),
    ).toBeTruthy();
  });

  it("shows account select when target_type is Account", () => {
    render(
      <CreateMacroForm
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    const accountRadio = screen.getByLabelText(/account/i, {
      selector: 'input[type="radio"]',
    });
    fireEvent.click(accountRadio);
    expect(screen.getByLabelText(/select account/i)).toBeTruthy();
  });

  it("shows goal select when target_type is Goal", () => {
    render(
      <CreateMacroForm
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    const goalRadio = screen.getByLabelText(/^goal$/i, {
      selector: 'input[type="radio"]',
    });
    fireEvent.click(goalRadio);
    expect(screen.getByLabelText(/select goal/i)).toBeTruthy();
  });

  it("hides category select when target_type is Goal", () => {
    render(
      <CreateMacroForm
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    const goalRadio = screen.getByLabelText(/^goal$/i, {
      selector: 'input[type="radio"]',
    });
    fireEvent.click(goalRadio);
    expect(screen.queryByLabelText(/category/i)).toBeNull();
  });

  it("shows category select when switching back to Account after Goal", () => {
    render(
      <CreateMacroForm
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    const goalRadio = screen.getByLabelText(/^goal$/i, {
      selector: 'input[type="radio"]',
    });
    fireEvent.click(goalRadio);
    const accountRadio = screen.getByLabelText(/account/i, {
      selector: 'input[type="radio"]',
    });
    fireEvent.click(accountRadio);
    expect(screen.getByLabelText(/category/i)).toBeTruthy();
  });

  it("calls createMacro with FormData on submit", async () => {
    render(
      <CreateMacroForm
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => {
      expect(createMacro).toHaveBeenCalledOnce();
      expect(createMacro).toHaveBeenCalledWith(expect.any(FormData));
    });
  });

  it("shows error message in ARIA region on action failure", async () => {
    (createMacro as Mock).mockResolvedValue(
      err(ErrorCode.MacroCreateFailed, "Creation failed"),
    );
    render(
      <CreateMacroForm
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => {
      const errors = screen.getAllByText(/Creation failed/i);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  it("shows success in ARIA region and resets form on success", async () => {
    render(
      <CreateMacroForm
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "My Macro" } });
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => {
      expect(createMacro).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(nameInput.value).toBe("");
    });
  });

  it("always renders ARIA live region with role=status and aria-live=polite", () => {
    render(
      <CreateMacroForm
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    const statusRegion = screen.getByRole("status");
    expect(statusRegion).toBeTruthy();
    expect(statusRegion.getAttribute("aria-live")).toBe("polite");
  });

  it("shows Add Macro submit button", () => {
    render(
      <CreateMacroForm
        accounts={mockAccounts}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    expect(screen.getByRole("button", { name: /add macro/i })).toBeTruthy();
  });

  it("shows inline prompt when no goals exist and goal target selected", () => {
    render(
      <CreateMacroForm
        accounts={mockAccounts}
        goals={[]}
        categories={mockCategories}
      />,
    );
    const goalRadio = screen.getByLabelText(/^goal$/i, {
      selector: 'input[type="radio"]',
    });
    fireEvent.click(goalRadio);
    expect(screen.getByText(/No goals yet/i)).toBeTruthy();
  });

  it("shows inline prompt when no accounts exist and account target selected", () => {
    render(
      <CreateMacroForm
        accounts={[]}
        goals={mockGoals}
        categories={mockCategories}
      />,
    );
    const accountRadio = screen.getByLabelText(/account/i, {
      selector: 'input[type="radio"]',
    });
    fireEvent.click(accountRadio);
    expect(screen.getByText(/No accounts yet/i)).toBeTruthy();
  });
});
