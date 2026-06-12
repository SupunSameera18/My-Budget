import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Account } from "@/features/accounts/schema";

vi.mock("@/features/accounts/server/actions", () => ({
  createInternalTransfer: vi.fn(),
}));

vi.mock("@/lib/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => true,
}));

vi.mock("@/components/feedback/OfflineRetryBanner", () => ({
  OfflineRetryBanner: () => null,
}));

import { InternalTransferForm } from "./InternalTransferForm";

const accounts: Account[] = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    user_id: "u1",
    name: "Main Bank",
    type: "bank",
    actual_balance_minor: 100000,
    currency: "USD",
    archived_at: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    user_id: "u1",
    name: "Savings",
    type: "savings",
    actual_balance_minor: 50000,
    currency: "USD",
    archived_at: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
  },
];

beforeEach(() => {
  vi.resetAllMocks();
});

describe("InternalTransferForm — fewer than 2 accounts", () => {
  it("renders 'Add at least two accounts' message when accounts.length < 2", () => {
    render(<InternalTransferForm accounts={[accounts[0]!]} currency="USD" />);
    expect(
      screen.getByText(/add at least two accounts to record a transfer/i),
    ).toBeInTheDocument();
  });
});

describe("InternalTransferForm — 2+ accounts", () => {
  it("renders the ARIA live region with role=status", () => {
    render(<InternalTransferForm accounts={accounts} currency="USD" />);
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toBeTruthy();
    expect(liveRegion.getAttribute("aria-live")).toBe("polite");
  });

  it("renders from/to selects and amount, date, note inputs", () => {
    render(<InternalTransferForm accounts={accounts} currency="USD" />);
    expect(screen.getByLabelText(/from account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/to account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/note/i)).toBeInTheDocument();
  });

  it("renders the submit button labeled 'Record transfer'", () => {
    render(<InternalTransferForm accounts={accounts} currency="USD" />);
    expect(
      screen.getByRole("button", { name: /record transfer/i }),
    ).toBeInTheDocument();
  });

  it("submit button is enabled when online and not pending", () => {
    render(<InternalTransferForm accounts={accounts} currency="USD" />);
    expect(
      screen.getByRole("button", { name: /record transfer/i }),
    ).not.toBeDisabled();
  });
});
