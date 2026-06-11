import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ChartPreferencesForm } from "./ChartPreferencesForm";
import { saveChartPreferences } from "@/features/analytics/server/actions";
import { err, ok, ErrorCode } from "@/lib/errors";

vi.mock("@/features/analytics/server/actions", () => ({
  saveChartPreferences: vi.fn(),
}));

describe("ChartPreferencesForm", () => {
  beforeEach(() => {
    (saveChartPreferences as Mock).mockResolvedValue(ok());
  });

  it("renders all 4 chart toggle rows with correct labels", () => {
    render(<ChartPreferencesForm initialPrefs={{}} />);
    expect(screen.getByText("Spending by Category")).toBeInTheDocument();
    expect(screen.getByText("Income vs Expenses")).toBeInTheDocument();
    expect(screen.getByText("Budget Performance")).toBeInTheDocument();
    expect(screen.getByText("This vs Last Month")).toBeInTheDocument();
  });

  it("all 4 charts are checked by default when initialPrefs is empty", () => {
    render(<ChartPreferencesForm initialPrefs={{}} />);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(4);
    for (const cb of checkboxes) {
      expect(cb).toBeChecked();
    }
  });

  it("toggling a checkbox calls saveChartPreferences with updated prefs", async () => {
    render(<ChartPreferencesForm initialPrefs={{}} />);
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);

    await waitFor(() => {
      expect(saveChartPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ spending_by_category: false }),
      );
    });
  });

  it("a chart initially disabled renders unchecked", () => {
    render(
      <ChartPreferencesForm initialPrefs={{ spending_by_category: false }} />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    // first checkbox is spending_by_category
    expect(checkboxes[0]).not.toBeChecked();
    // others are still checked
    expect(checkboxes[1]).toBeChecked();
  });

  it("ARIA live region exists with role=status and aria-live=polite", () => {
    render(<ChartPreferencesForm initialPrefs={{}} />);
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
  });

  it("reverts checkbox to pre-toggle state when saveChartPreferences fails", async () => {
    (saveChartPreferences as Mock).mockResolvedValue(
      err(ErrorCode.ProfileUpdateFailed, "DB error"),
    );
    render(<ChartPreferencesForm initialPrefs={{}} />);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked(); // initially enabled

    fireEvent.click(checkboxes[0]); // optimistic toggle → unchecked

    await waitFor(() => {
      // after failed save, should revert to checked
      expect(checkboxes[0]).toBeChecked();
    });
  });
});
