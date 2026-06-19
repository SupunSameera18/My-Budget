import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { deriveSettleUpLabel } from "@/features/family/settle-label";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/features/family/server/actions", () => ({
  markSettled: vi.fn(),
}));
vi.mock("@/features/family/settle-label", () => ({
  deriveSettleUpLabel: vi.fn((tally: number, partner: string) => {
    if (tally > 0)
      return `Receive $${(tally / 100).toFixed(2)} from ${partner}`;
    if (tally < 0)
      return `Transfer $${(Math.abs(tally) / 100).toFixed(2)} to ${partner}`;
    return "You're all settled up.";
  }),
}));

import { SettleUpPanel } from "./SettleUpPanel";
import { markSettled } from "@/features/family/server/actions";
import { useRouter } from "next/navigation";

const mockRefresh = vi.fn();

function renderPanel(props?: Partial<Parameters<typeof SettleUpPanel>[0]>) {
  return render(
    <SettleUpPanel
      isFamilyMode={true}
      tally={5000}
      familyUnitId="unit-123"
      partnerDisplayName="Alex"
      currency="USD"
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useRouter).mockReturnValue({
    refresh: mockRefresh,
  } as never);
  vi.mocked(markSettled).mockResolvedValue({
    ok: true,
    data: { settlementId: "settle-uuid" },
  });
  vi.mocked(deriveSettleUpLabel).mockImplementation(
    (tally: number, partner: string) => {
      if (tally > 0)
        return `Receive $${(tally / 100).toFixed(2)} from ${partner}`;
      if (tally < 0)
        return `Transfer $${(Math.abs(tally) / 100).toFixed(2)} to ${partner}`;
      return "You're all settled up.";
    },
  );
});

describe("SettleUpPanel", () => {
  it("renders nothing when isFamilyMode=false", () => {
    const { container } = renderPanel({ isFamilyMode: false });
    expect(container.firstChild).toBeNull();
  });

  it("positive tally: renders directional label and trust line", () => {
    renderPanel({ tally: 5000 });
    expect(screen.getByText("Receive $50.00 from Alex")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      "My Budget tracks this — you make the transfer.",
    );
  });

  it("negative tally: renders directional label correctly", () => {
    renderPanel({ tally: -3000 });
    expect(screen.getByText("Transfer $30.00 to Alex")).toBeInTheDocument();
  });

  it("zero tally: renders settled-up message and aria-disabled button", () => {
    renderPanel({ tally: 0 });
    expect(screen.getByText("You're all settled up.")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /mark as settled/i });
    expect(btn).toHaveAttribute("aria-disabled", "true");
    // zero-balance: NOT html-disabled (stays in tab order)
    expect(btn).not.toBeDisabled();
  });

  it("zero tally: trust line is absent", () => {
    renderPanel({ tally: 0 });
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("null tally (fetch error): renders EmptyState", () => {
    renderPanel({ tally: null });
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: /unable to load balance/i,
      }),
    ).toBeInTheDocument();
  });

  it("ARIA live region is always in DOM (positive tally)", () => {
    renderPanel({ tally: 5000 });
    const live = screen.getByRole("status");
    expect(live).toBeInTheDocument();
    expect(live).toHaveAttribute("aria-live", "polite");
  });

  it("ARIA live region is always in DOM (zero tally)", () => {
    renderPanel({ tally: 0 });
    const live = screen.getByRole("status");
    expect(live).toBeInTheDocument();
  });

  it("ARIA live region is always in DOM (null tally / fetch error)", () => {
    renderPanel({ tally: null });
    const live = screen.getByRole("status");
    expect(live).toBeInTheDocument();
    expect(live).toHaveAttribute("aria-live", "polite");
  });

  it("button has no aria-disabled when tally is non-zero and not pending", () => {
    renderPanel({ tally: 5000 });
    const btn = screen.getByRole("button", { name: /mark as settled/i });
    expect(btn).not.toHaveAttribute("aria-disabled");
  });

  it("clicking Mark as settled shows inline confirmation dialog (non-zero tally)", () => {
    renderPanel({ tally: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /mark as settled/i }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(
      screen.getByText(/lock shared transactions/i),
    ).toBeInTheDocument();
    expect(vi.mocked(markSettled)).not.toHaveBeenCalled();
  });

  it("Cancel in confirmation hides the dialog without settling", () => {
    renderPanel({ tally: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /mark as settled/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(vi.mocked(markSettled)).not.toHaveBeenCalled();
  });

  it("button has aria-disabled='true' and is html-disabled when isPending", async () => {
    vi.mocked(markSettled).mockImplementation(() => new Promise(() => {}));
    renderPanel({ tally: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /mark as settled/i }));
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /confirm settle up/i }),
      );
    });
    const primaryBtn = screen.getByRole("button", { name: /mark as settled/i });
    expect(primaryBtn).toHaveAttribute("aria-disabled", "true");
    expect(primaryBtn).toBeDisabled();
  });

  it("mark as settled button calls markSettled and router.refresh on success", async () => {
    renderPanel({ tally: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /mark as settled/i }));
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /confirm settle up/i }),
      );
    });
    expect(vi.mocked(markSettled)).toHaveBeenCalledWith("unit-123");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("ARIA live region announces success after settle", async () => {
    renderPanel({ tally: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /mark as settled/i }));
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /confirm settle up/i }),
      );
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Balance settled. Running tally has been reset.",
    );
  });

  it("ARIA live region announces error when markSettled fails", async () => {
    vi.mocked(markSettled).mockResolvedValue({
      ok: false,
      error: { code: "settle_up_failed" as never, message: "rpc error" },
    });
    renderPanel({ tally: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /mark as settled/i }));
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /confirm settle up/i }),
      );
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Settlement failed. Please try again.",
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("trust line has role='note' in non-zero state", () => {
    renderPanel({ tally: 1234 });
    expect(screen.getByRole("note")).toBeInTheDocument();
  });
});
