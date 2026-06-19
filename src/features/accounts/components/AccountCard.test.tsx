import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Account } from "@/features/accounts/schema";

vi.mock("@/features/accounts/server/actions", () => ({
  updateAccount: vi.fn(),
  archiveAccount: vi.fn(),
  unarchiveAccount: vi.fn(),
  deleteAccount: vi.fn(),
}));

import {
  updateAccount,
  archiveAccount,
  unarchiveAccount,
  deleteAccount,
} from "@/features/accounts/server/actions";
import { AccountCard } from "./AccountCard";

const mockAccount: Account = {
  id: "test-id",
  user_id: "user-id",
  name: "Test Account",
  type: "bank",
  actual_balance_minor: 150000,
  currency: "USD",
  archived_at: null,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  // Default: actions succeed
  (archiveAccount as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    data: undefined,
  });
  (unarchiveAccount as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    data: undefined,
  });
  (deleteAccount as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    data: undefined,
  });
  (updateAccount as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    data: mockAccount,
  });
});

describe("AccountCard — active account (isArchived=false)", () => {
  it("shows account name, type label, and formatted balance", () => {
    render(
      <AccountCard
        account={mockAccount}
        hasHistory={false}
        isArchived={false}
      />,
    );
    expect(screen.getByText("Test Account")).toBeInTheDocument();
    expect(screen.getByText("Bank")).toBeInTheDocument();
    // formatMoney(150000, "USD") → "$1,500.00"
    expect(screen.getByText("$1,500.00")).toBeInTheDocument();
  });

  it("shows Edit and Archive buttons", () => {
    render(
      <AccountCard
        account={mockAccount}
        hasHistory={false}
        isArchived={false}
      />,
    );
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /archive/i }),
    ).toBeInTheDocument();
  });

  it("does NOT show Delete button when not archived", () => {
    render(
      <AccountCard
        account={mockAccount}
        hasHistory={false}
        isArchived={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /delete/i }),
    ).not.toBeInTheDocument();
  });

  it("clicking Edit shows the inline edit form with current values", async () => {
    render(
      <AccountCard
        account={mockAccount}
        hasHistory={false}
        isArchived={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    const nameInput = screen.getByRole("textbox");
    expect(nameInput).toBeInTheDocument();
    expect((nameInput as HTMLInputElement).defaultValue).toBe("Test Account");
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("clicking Cancel from edit mode returns to view mode without calling updateAccount", async () => {
    render(
      <AccountCard
        account={mockAccount}
        hasHistory={false}
        isArchived={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.getByText("Test Account")).toBeInTheDocument();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("clicking Archive calls archiveAccount with the account id", async () => {
    render(
      <AccountCard
        account={mockAccount}
        hasHistory={false}
        isArchived={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /archive/i }));
    await waitFor(() => {
      expect(archiveAccount).toHaveBeenCalledWith("test-id");
    });
  });
});

describe("AccountCard — archived account (isArchived=true)", () => {
  const archivedAccount: Account = {
    ...mockAccount,
    archived_at: "2026-06-04T00:00:00Z",
  };

  it("shows Unarchive button and no Archive button", () => {
    render(
      <AccountCard
        account={archivedAccount}
        hasHistory={false}
        isArchived={true}
      />,
    );
    expect(
      screen.getByRole("button", { name: /unarchive/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^archive$/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Delete button when hasHistory=false", () => {
    render(
      <AccountCard
        account={archivedAccount}
        hasHistory={false}
        isArchived={true}
      />,
    );
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("shows Delete button when hasHistory=true but clicking explains it is blocked", async () => {
    render(
      <AccountCard
        account={archivedAccount}
        hasHistory={true}
        isArchived={true}
      />,
    );
    const deleteBtn = screen.getByRole("button", { name: /delete/i });
    expect(deleteBtn).toBeInTheDocument();
    await userEvent.click(deleteBtn);
    expect(
      screen.getByText(/has transactions, so it can't be deleted/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/delete permanently\? this cannot be undone/i),
    ).not.toBeInTheDocument();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("clicking Delete shows confirmation UI before calling deleteAccount", async () => {
    render(
      <AccountCard
        account={archivedAccount}
        hasHistory={false}
        isArchived={true}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(
      screen.getByText(/delete permanently\? this cannot be undone/i),
    ).toBeInTheDocument();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("confirming delete calls deleteAccount with the account id", async () => {
    render(
      <AccountCard
        account={archivedAccount}
        hasHistory={false}
        isArchived={true}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    // Confirm dialog must be visible before clicking the confirm button
    expect(
      screen.getByText(/delete permanently\? this cannot be undone/i),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() => {
      expect(deleteAccount).toHaveBeenCalledWith("test-id");
    });
  });

  it("cancelling delete confirmation returns to view mode", async () => {
    render(
      <AccountCard
        account={archivedAccount}
        hasHistory={false}
        isArchived={true}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(
      screen.queryByText(/delete permanently\? this cannot be undone/i),
    ).not.toBeInTheDocument();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("clicking Unarchive calls unarchiveAccount with the account id", async () => {
    render(
      <AccountCard
        account={archivedAccount}
        hasHistory={false}
        isArchived={true}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /unarchive/i }));
    await waitFor(() => {
      expect(unarchiveAccount).toHaveBeenCalledWith("test-id");
    });
  });
});
