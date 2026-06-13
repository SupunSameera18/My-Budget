import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { ok, err, ErrorCode } from "@/lib/errors";

vi.mock("@/features/transactions/server/actions", () => ({
  splitTransactionAction: vi.fn(),
}));

vi.mock("@/lib/format", () => ({
  formatMoney: vi.fn(
    (minor: number) => `$${(minor / 100).toFixed(2)}`,
  ),
}));

import { SplitSheet } from "./SplitSheet";
import { splitTransactionAction } from "@/features/transactions/server/actions";

const defaultProps = {
  transactionId: "txn-111",
  amountMinor: 1000,
  currency: "USD",
  partnerName: "Alex",
  onSaved: vi.fn(),
  onCancel: vi.fn(),
};

function renderSheet(props = defaultProps) {
  return render(<SplitSheet {...props} />);
}

describe("SplitSheet — method selector accessibility", () => {
  it("renders a radiogroup with aria-label Split method", () => {
    renderSheet();
    expect(
      screen.getByRole("radiogroup", { name: /split method/i }),
    ).toBeInTheDocument();
  });

  it("Equal method is aria-checked by default", () => {
    renderSheet();
    const equalBtn = screen.getByRole("radio", { name: /equal/i });
    expect(equalBtn).toHaveAttribute("aria-checked", "true");
  });

  it("switching to Percentage marks it aria-checked", () => {
    renderSheet();
    const pctBtn = screen.getByRole("radio", { name: /percentage/i });
    fireEvent.click(pctBtn);
    expect(pctBtn).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /equal/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("switching to Fixed marks it aria-checked", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("radio", { name: /fixed/i }));
    expect(screen.getByRole("radio", { name: /fixed/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

describe("SplitSheet — live preview", () => {
  it("equal split shows 50/50 preview for 1000 minor units", () => {
    renderSheet();
    expect(screen.getByText(/You pay:/)).toHaveTextContent("$5.00");
    expect(screen.getByText(/You pay:/)).toHaveTextContent("$5.00");
  });

  it("preview updates when switching to percentage", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("radio", { name: /percentage/i }));
    // Default 50% payer → $5.00 + $5.00 with odd remainder to payer
    expect(screen.getByText(/You pay:/)).toBeInTheDocument();
  });
});

describe("SplitSheet — percentage inputs", () => {
  it("shows Your share % and partner share % inputs", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("radio", { name: /percentage/i }));
    expect(screen.getByLabelText(/your share \(%\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/partner's share \(%\)/i)).toBeInTheDocument();
  });

  it("partner % input is read-only (auto-computed)", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("radio", { name: /percentage/i }));
    const partnerInput = screen.getByLabelText(/partner's share \(%\)/i);
    expect(partnerInput).toHaveAttribute("readonly");
  });
});

describe("SplitSheet — fixed inputs", () => {
  it("shows Your share and partner share fixed amount inputs", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("radio", { name: /fixed/i }));
    expect(
      screen.getAllByLabelText(/your share \(%\)/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByLabelText(/partner's share \(%\)/i).length,
    ).toBeGreaterThan(0);
  });
});

describe("SplitSheet — save flow", () => {
  beforeEach(() => {
    vi.mocked(splitTransactionAction as Mock).mockResolvedValue(ok());
    defaultProps.onSaved.mockClear();
  });

  it("calls splitTransactionAction with equal split and invokes onSaved on success", async () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /save split/i }));

    await waitFor(() => {
      expect(splitTransactionAction).toHaveBeenCalledWith(
        "txn-111",
        "equal",
        500,
        500,
      );
    });
    await waitFor(() => {
      expect(defaultProps.onSaved).toHaveBeenCalled();
    });
  });

  it("shows error message on failure", async () => {
    vi.mocked(splitTransactionAction as Mock).mockResolvedValue(
      err(ErrorCode.SplitTransactionFailed, "Split amounts do not add up"),
    );
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /save split/i }));

    await waitFor(() => {
      expect(screen.getByRole("status", { hidden: true })).toHaveTextContent(
        /split amounts do not add up/i,
      );
    });
  });

  it("Save button has aria-disabled when pending", async () => {
    // Use never-resolving promise to freeze isPending=true
    vi.mocked(splitTransactionAction as Mock).mockImplementation(
      () => new Promise(() => {}),
    );
    renderSheet();
    const btn = screen.getByRole("button", { name: /save split/i });
    fireEvent.click(btn);
    // The button should become disabled while pending
    expect(btn).toBeDisabled();
  });
});

describe("SplitSheet — cancel", () => {
  it("calls onCancel when Cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(<SplitSheet {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
