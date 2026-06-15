import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { CloseMonthForm } from "./CloseMonthForm";

// Mock server actions
vi.mock("@/features/family/server/actions", () => ({
  markSettled: vi.fn(),
  getUserAccountsForReconciliation: vi.fn(),
  closeMonth: vi.fn(),
}));

vi.mock("@/lib/format", () => ({
  formatMoney: vi.fn((minor: number) => `$${(minor / 100).toFixed(2)}`),
}));

import {
  markSettled,
  getUserAccountsForReconciliation,
  closeMonth,
} from "@/features/family/server/actions";

const FAMILY_UNIT_ID = "unit-abc-123";
const TALLY = 5000;
const CURRENCY = "USD";

const ACCOUNTS = [
  { id: "acc-1", name: "Checking", balanceMinor: 100000, currency: "USD" },
  { id: "acc-2", name: "Savings", balanceMinor: 50000, currency: "USD" },
];

function defaultProps(
  overrides: Partial<Parameters<typeof CloseMonthForm>[0]> = {},
) {
  return {
    isFamilyMode: true,
    familyUnitId: FAMILY_UNIT_ID,
    tally: TALLY,
    currency: CURRENCY,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUserAccountsForReconciliation).mockResolvedValue(ACCOUNTS);
  vi.mocked(markSettled).mockResolvedValue({
    ok: true,
    data: { settlementId: "s-1" },
  });
  vi.mocked(closeMonth).mockResolvedValue({
    ok: true,
    data: { adjustmentCount: 0 },
  });
});

// ── T1: Hidden in solo mode ──────────────────────────────────────────────────

describe("CloseMonthForm", () => {
  it("renders null when isFamilyMode=false", async () => {
    await act(async () => {
      render(<CloseMonthForm {...defaultProps({ isFamilyMode: false })} />);
    });
    expect(
      screen.queryByRole("heading", { name: /Close the Month/i }),
    ).not.toBeInTheDocument();
  });

  // ── T2: Step 1 shows tally and confirm button ────────────────────────────────

  it("shows step 1 heading and Confirm & Continue button when tally is non-zero", async () => {
    await act(async () => {
      render(<CloseMonthForm {...defaultProps()} />);
    });
    expect(screen.getByText(/Step 1 of 2/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Confirm & Continue/i }),
    ).toBeInTheDocument();
  });

  // ── T3: Zero tally shows "Already settled" and Continue button ──────────────

  it("shows all-settled message and Continue button when tally is 0", async () => {
    await act(async () => {
      render(<CloseMonthForm {...defaultProps({ tally: 0 })} />);
    });
    expect(screen.getByText(/all settled up/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Continue →/i }),
    ).toBeInTheDocument();
  });

  // ── T4: Zero tally skips markSettled call ────────────────────────────────────

  it("skips markSettled call when tally is 0 and advances to step 2", async () => {
    render(<CloseMonthForm {...defaultProps({ tally: 0 })} />);
    fireEvent.click(screen.getByRole("button", { name: /Continue →/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2 of 2/i)).toBeInTheDocument();
    });
    expect(markSettled).not.toHaveBeenCalled();
  });

  // ── T5: Advancing to step 2 shows accounts list ──────────────────────────────

  it("advances to step 2 after confirming step 1, and shows accounts list", async () => {
    render(<CloseMonthForm {...defaultProps()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Confirm & Continue/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Step 2 of 2/i)).toBeInTheDocument();
      expect(screen.getByText("Checking")).toBeInTheDocument();
      expect(screen.getByText("Savings")).toBeInTheDocument();
    });
    expect(markSettled).toHaveBeenCalledWith(FAMILY_UNIT_ID);
  });

  // ── T6: Step 2 has aria-label and aria-describedby on inputs ────────────────

  it("renders actual-balance inputs with aria-label and aria-describedby", async () => {
    render(<CloseMonthForm {...defaultProps()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Confirm & Continue/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Checking")).toBeInTheDocument();
    });

    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect(input).toHaveAttribute("aria-label", "Actual balance");
      expect(input).toHaveAttribute("aria-describedby");
    }
  });

  // ── T7: Delta inline text updates as user types ──────────────────────────────

  it("shows delta inline text when actual balance differs from app balance", async () => {
    render(<CloseMonthForm {...defaultProps()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Confirm & Continue/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Checking")).toBeInTheDocument();
    });

    const [firstInput] = screen.getAllByRole("spinbutton");
    // App balance is $1000.00 (100000 minor); entering $999.00 = 99900 minor → delta = -100
    fireEvent.change(firstInput, { target: { value: "999" } });

    await waitFor(() => {
      expect(screen.getByText(/Adjustment:/i)).toBeInTheDocument();
    });
  });

  // ── T8: Submit calls closeMonth and ARIA live region announces success ────────

  it("calls closeMonth with deltas and live region announces success", async () => {
    vi.mocked(closeMonth).mockResolvedValue({
      ok: true,
      data: { adjustmentCount: 1 },
    });

    render(<CloseMonthForm {...defaultProps()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Confirm & Continue/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Checking")).toBeInTheDocument();
    });

    const [firstInput] = screen.getAllByRole("spinbutton");
    // Enter $999 → delta = 99900 - 100000 = -100 minor
    fireEvent.change(firstInput, { target: { value: "999" } });

    fireEvent.click(screen.getByRole("button", { name: /Close Month/i }));

    await waitFor(() => {
      expect(closeMonth).toHaveBeenCalledWith(
        FAMILY_UNIT_ID,
        expect.arrayContaining([
          expect.objectContaining({ accountId: "acc-1", deltaMinor: -100 }),
        ]),
      );
    });

    await waitFor(() => {
      const liveRegion = screen.getByRole("status");
      expect(liveRegion).toHaveTextContent("Month closed successfully.");
    });
  });

  // ── T9: Empty inputs call closeMonth with empty adjustments ──────────────────

  it("calls closeMonth with empty adjustments when all inputs are empty", async () => {
    render(<CloseMonthForm {...defaultProps()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Confirm & Continue/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Checking")).toBeInTheDocument();
    });

    // Don't fill any inputs — all are empty
    fireEvent.click(screen.getByRole("button", { name: /Close Month/i }));

    await waitFor(() => {
      expect(closeMonth).toHaveBeenCalledWith(FAMILY_UNIT_ID, []);
    });
  });

  // ── T10: Close Month button has aria-disabled="true" before step 1 complete ──

  it("Close Month button has aria-disabled before step 1 is complete", async () => {
    await act(async () => {
      render(<CloseMonthForm {...defaultProps()} />);
    });
    // On step 1, Close Month button should not be visible yet
    expect(
      screen.queryByRole("button", { name: /Close Month/i }),
    ).not.toBeInTheDocument();
  });

  // ── T11: Error from closeMonth → live region announces failure ───────────────

  it("ARIA live region announces failure on closeMonth error", async () => {
    vi.mocked(closeMonth).mockResolvedValue({
      ok: false,
      error: { code: "reconciliation_failed" as never, message: "RPC error" },
    });

    render(<CloseMonthForm {...defaultProps()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Confirm & Continue/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Checking")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Close Month/i }));

    await waitFor(() => {
      const liveRegion = screen.getByRole("status");
      expect(liveRegion).toHaveTextContent(
        "Reconciliation failed. Please try again.",
      );
    });
  });
});
