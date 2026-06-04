import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Account } from "@/features/accounts/schema";

vi.mock("@/features/accounts/server/actions", () => ({
  createExternalTransfer: vi.fn(),
}));

vi.mock("@/lib/hooks/useOnlineStatus", () => ({
  useOnlineStatus: vi.fn(() => true),
}));

vi.mock("@/components/feedback/OfflineRetryBanner", () => ({
  OfflineRetryBanner: () => null,
}));

import { ExternalTransferForm } from "./ExternalTransferForm";
import { createExternalTransfer } from "@/features/accounts/server/actions";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";

const VALID_UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const accounts: Account[] = [
  {
    id: VALID_UUID_A,
    user_id: "u1",
    name: "Main Bank",
    type: "bank",
    actual_balance_minor: 100000,
    currency: "USD",
    archived_at: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useOnlineStatus).mockReturnValue(true);
});

describe("ExternalTransferForm — no accounts", () => {
  it("renders 'Add an account' message when accounts.length < 1", () => {
    render(<ExternalTransferForm accounts={[]} />);
    expect(
      screen.getByText(/add an account to record an external transfer/i),
    ).toBeInTheDocument();
  });
});

describe("ExternalTransferForm — 1+ accounts", () => {
  it("renders account select, direction select, amount, date, note inputs", () => {
    render(<ExternalTransferForm accounts={accounts} />);
    expect(screen.getByLabelText(/account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/direction/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/note/i)).toBeInTheDocument();
  });

  it("renders the submit button labeled 'Record transfer'", () => {
    render(<ExternalTransferForm accounts={accounts} />);
    expect(
      screen.getByRole("button", { name: /record transfer/i }),
    ).toBeInTheDocument();
  });

  it("submit button is enabled when online and not pending", () => {
    render(<ExternalTransferForm accounts={accounts} />);
    expect(
      screen.getByRole("button", { name: /record transfer/i }),
    ).not.toBeDisabled();
  });

  it("submit button is disabled when offline", () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    render(<ExternalTransferForm accounts={accounts} />);
    expect(
      screen.getByRole("button", { name: /record transfer/i }),
    ).toBeDisabled();
  });

  it("resets form fields after successful submission", async () => {
    vi.mocked(createExternalTransfer).mockResolvedValue({
      ok: true,
      data: undefined,
    });
    render(<ExternalTransferForm accounts={accounts} />);

    const amountInput = screen.getByLabelText(/amount/i) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: "100.00" } });
    expect(amountInput.value).toBe("100.00");

    const form = screen
      .getByRole("button", { name: /record transfer/i })
      .closest("form")!;

    await act(async () => {
      fireEvent.submit(form);
    });

    expect(vi.mocked(createExternalTransfer)).toHaveBeenCalledOnce();
    expect(amountInput.value).toBe("");
  });
});
