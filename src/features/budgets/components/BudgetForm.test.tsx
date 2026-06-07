import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/features/budgets/server/actions", () => ({
  createBudget: vi.fn(),
}));

vi.mock("@/components/feedback/OfflineRetryBanner", () => ({
  OfflineRetryBanner: () => null,
}));

vi.mock("react-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-dom")>();
  return {
    ...mod,
    useFormStatus: () => ({ pending: false }),
  };
});

import { BudgetForm } from "./BudgetForm";
import { createBudget } from "@/features/budgets/server/actions";
import type { BudgetFormData } from "@/features/budgets/schema";

const mockFormData: BudgetFormData = {
  categories: [
    { id: "aaaaaaaa-0001-4000-8000-000000000001", name: "Groceries" },
    { id: "aaaaaaaa-0002-4000-8000-000000000002", name: "Dining" },
  ],
  currency: "USD",
};

describe("BudgetForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createBudget as Mock).mockResolvedValue({
      ok: true,
      data: { id: "new-id" },
    });
  });

  it("renders name, limit amount, period select, and category checkboxes", () => {
    render(<BudgetForm data={mockFormData} />);
    expect(screen.getByLabelText(/name/i)).toBeTruthy();
    expect(screen.getByLabelText(/limit/i)).toBeTruthy();
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.getByLabelText("Groceries")).toBeTruthy();
    expect(screen.getByLabelText("Dining")).toBeTruthy();
  });

  it("custom date inputs are hidden when period type is not 'custom'", () => {
    render(<BudgetForm data={mockFormData} />);
    expect(screen.queryByLabelText(/start date/i)).toBeNull();
    expect(screen.queryByLabelText(/end date/i)).toBeNull();
  });

  it("custom date inputs appear when period type is changed to 'custom'", () => {
    render(<BudgetForm data={mockFormData} />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "custom" } });
    expect(screen.getByLabelText(/start date/i)).toBeTruthy();
    expect(screen.getByLabelText(/end date/i)).toBeTruthy();
  });

  it("ARIA live region is present from initial render with aria-live and role=status", () => {
    render(<BudgetForm data={mockFormData} />);
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toBeTruthy();
    expect(liveRegion.getAttribute("aria-live")).toBe("polite");
  });

  it("shows an error when submitted without any category checked", async () => {
    const { container } = render(<BudgetForm data={mockFormData} />);
    const nameInput = screen.getByLabelText(/name/i);
    fireEvent.change(nameInput, { target: { value: "My Budget" } });
    const limitInput = screen.getByLabelText(/limit/i);
    fireEvent.change(limitInput, { target: { value: "100" } });
    // Submit the form directly — no checkboxes checked
    const form = container.querySelector("form")!;
    fireEvent.submit(form);
    const errors = await screen.findAllByText(/select at least one category/i);
    expect(errors.length).toBeGreaterThan(0);
  });
});
