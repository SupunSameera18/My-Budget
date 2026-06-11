import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ok } from "@/lib/errors";

vi.mock("@/features/settings/server/actions", () => ({
  getAllUserData: vi.fn(),
}));

// Mock URL.createObjectURL and revokeObjectURL (jsdom doesn't implement these)
global.URL.createObjectURL = vi.fn(() => "blob:mock");
global.URL.revokeObjectURL = vi.fn();

const mockExportData = ok({
  exported_at: "2026-06-12T00:00:00.000Z",
  app_version: "my-budget-v1",
  tables: {
    accounts: [],
    categories: [],
    transactions: [],
    budgets: [],
    budget_categories: [],
    goals: [],
    goal_contributions: [],
    macros: [],
    transfers: [],
  },
});

describe("DownloadDataButton", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const actions = await import("@/features/settings/server/actions");
    vi.mocked(actions.getAllUserData).mockResolvedValue(mockExportData);
  });

  it('renders "Download my data (JSON)" button', async () => {
    const { DownloadDataButton } = await import("./DownloadDataButton");
    render(<DownloadDataButton />);
    expect(
      screen.getByRole("button", { name: /download my data/i }),
    ).toBeTruthy();
  });

  it("renders ARIA live region with role=status and aria-live=polite", async () => {
    const { DownloadDataButton } = await import("./DownloadDataButton");
    render(<DownloadDataButton />);
    const liveRegion = screen.getByRole("status");
    expect(liveRegion.getAttribute("aria-live")).toBe("polite");
  });

  it("button is accessible (not disabled) by default", async () => {
    const { DownloadDataButton } = await import("./DownloadDataButton");
    render(<DownloadDataButton />);
    const btn = screen.getByRole("button", { name: /download my data/i });
    expect(btn).not.toHaveAttribute("disabled");
    expect(btn.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("shows Preparing… text while pending (never-resolving promise)", async () => {
    const actions = await import("@/features/settings/server/actions");
    vi.mocked(actions.getAllUserData).mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    const { DownloadDataButton } = await import("./DownloadDataButton");
    render(<DownloadDataButton />);

    await userEvent.click(screen.getByRole("button"));

    // While the promise is pending, button shows "Preparing…"
    expect(screen.getByRole("button").textContent).toBe("Preparing…");
    // ARIA live region must also announce the status
    expect(screen.getByRole("status").textContent).toBe("Preparing your data…");
  });
});
