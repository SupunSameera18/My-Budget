import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { pdf } from "@react-pdf/renderer";
import { ExportPdfButton } from "./ExportPdfButton";

vi.mock("@react-pdf/renderer", () => ({
  Document: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Page: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Text: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  StyleSheet: { create: <T extends object>(s: T) => s },
  pdf: vi.fn(() => ({
    toBlob: vi.fn().mockResolvedValue(new Blob(["fake-pdf"])),
  })),
}));

vi.mock("@/features/analytics/server/actions", () => ({
  getExportData: vi.fn(),
  getMonthlySummaryData: vi.fn(),
}));

const defaultProps = {
  period: { start: "2026-05-01", end: "2026-05-31" },
  selectedMonth: "2026-05",
};

describe("ExportPdfButton", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Re-seed pdf mock — vi.resetAllMocks() clears the factory implementation (dev-learnings §5)
    vi.mocked(pdf).mockReturnValue({
      toBlob: vi.fn().mockResolvedValue(new Blob(["fake-pdf"])),
    } as never);
  });

  it("renders Export PDF button", () => {
    render(<ExportPdfButton {...defaultProps} />);
    expect(screen.getByRole("button", { name: /export pdf/i })).toBeTruthy();
  });

  it("button is not disabled by default", () => {
    render(<ExportPdfButton {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /export pdf/i });
    expect(btn).not.toHaveAttribute("disabled");
    expect(btn.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("renders ARIA live region with role=status and aria-live=polite", () => {
    render(<ExportPdfButton {...defaultProps} />);
    const liveRegion = screen.getByRole("status");
    expect(liveRegion.getAttribute("aria-live")).toBe("polite");
  });

  it("sets PDF export failed when getExportData returns null", async () => {
    const { getExportData, getMonthlySummaryData } =
      await import("@/features/analytics/server/actions");
    vi.mocked(getExportData).mockResolvedValue(null);
    vi.mocked(getMonthlySummaryData).mockResolvedValue({
      period: { start: "2026-05-01", end: "2026-05-31" },
      currency: "USD",
      incomeMinor: 0,
      expenseMinor: 0,
      netMinor: 0,
      topCategories: [],
      budgets: [],
      goals: [],
      healthScore: null,
    });

    render(<ExportPdfButton {...defaultProps} />);
    await userEvent.click(screen.getByRole("button"));
    await act(async () => {});

    expect(screen.getByRole("status").textContent).toBe("PDF export failed");
  });

  it("sets PDF export failed when getMonthlySummaryData returns null", async () => {
    const { getExportData, getMonthlySummaryData } =
      await import("@/features/analytics/server/actions");
    vi.mocked(getExportData).mockResolvedValue([]);
    vi.mocked(getMonthlySummaryData).mockResolvedValue(null);

    render(<ExportPdfButton {...defaultProps} />);
    await userEvent.click(screen.getByRole("button"));
    await act(async () => {});

    expect(screen.getByRole("status").textContent).toBe("PDF export failed");
  });
});
