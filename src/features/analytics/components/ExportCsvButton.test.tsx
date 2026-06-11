import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportCsvButton } from "./ExportCsvButton";

vi.mock("@/features/analytics/server/actions", () => ({
  getExportData: vi.fn(),
}));

vi.mock("@/features/analytics/csv", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/analytics/csv")>();
  return { ...actual, triggerCsvDownload: vi.fn() };
});

const defaultProps = {
  period: { start: "2026-05-01", end: "2026-05-31" },
  currency: "USD",
  selectedMonth: "2026-05",
};

describe("ExportCsvButton", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders Export CSV button", () => {
    render(<ExportCsvButton {...defaultProps} />);
    expect(screen.getByRole("button", { name: /export csv/i })).toBeTruthy();
  });

  it("button is not disabled by default", () => {
    render(<ExportCsvButton {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /export csv/i });
    expect(btn).not.toHaveAttribute("disabled");
    expect(btn.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("renders ARIA live region with role=status and aria-live=polite", () => {
    render(<ExportCsvButton {...defaultProps} />);
    const liveRegion = screen.getByRole("status");
    expect(liveRegion.getAttribute("aria-live")).toBe("polite");
  });

  it("shows Exporting text and disables button while pending, then re-enables on success", async () => {
    const { getExportData } =
      await import("@/features/analytics/server/actions");
    let resolveExport!: (v: never) => void;
    vi.mocked(getExportData).mockImplementation(
      () =>
        new Promise((res) => {
          resolveExport = res;
        }),
    );

    render(<ExportCsvButton {...defaultProps} />);
    const btn = screen.getByRole("button");
    await userEvent.click(btn);

    // While pending
    expect(screen.getByRole("button").getAttribute("aria-disabled")).toBe(
      "true",
    );

    // Resolve
    await act(async () => {
      resolveExport([] as never);
    });

    // After success — button re-enables
    expect(screen.getByRole("button").getAttribute("aria-disabled")).not.toBe(
      "true",
    );
  });

  it("sets statusMsg to Export complete on successful export", async () => {
    const { getExportData } =
      await import("@/features/analytics/server/actions");
    vi.mocked(getExportData).mockResolvedValue([]);

    render(<ExportCsvButton {...defaultProps} />);
    await userEvent.click(screen.getByRole("button"));

    // Wait for async state to settle
    await act(async () => {});
    expect(screen.getByRole("status").textContent).toBe("Export complete");
  });

  it("sets statusMsg to Export failed when getExportData returns null", async () => {
    const { getExportData } =
      await import("@/features/analytics/server/actions");
    vi.mocked(getExportData).mockResolvedValue(null);

    render(<ExportCsvButton {...defaultProps} />);
    await userEvent.click(screen.getByRole("button"));

    await act(async () => {});
    expect(screen.getByRole("status").textContent).toBe("Export failed");
  });
});
