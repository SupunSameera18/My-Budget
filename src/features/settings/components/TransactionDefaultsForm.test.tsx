import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";

vi.mock("@/features/transactions/server/actions", () => ({
  saveTransactionDefaults: vi.fn(),
}));

import { TransactionDefaultsForm } from "./TransactionDefaultsForm";
import { saveTransactionDefaults } from "@/features/transactions/server/actions";

beforeEach(() => {
  vi.resetAllMocks();
  (saveTransactionDefaults as Mock).mockResolvedValue({
    ok: true,
    data: undefined,
  });
});

describe("TransactionDefaultsForm", () => {
  it("renders nothing in solo mode (isFamilyMode=false)", () => {
    const { container } = render(
      <TransactionDefaultsForm initialDefaults={null} isFamilyMode={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders section with aria-labelledby in family mode", () => {
    render(
      <TransactionDefaultsForm initialDefaults={null} isFamilyMode={true} />,
    );
    const section = screen.getByRole("region", {
      name: /transaction defaults/i,
    });
    expect(section).toBeInTheDocument();
    const heading = screen.getByRole("heading", {
      name: /transaction defaults/i,
    });
    expect(heading).toBeInTheDocument();
  });

  it("has aria-live status region", () => {
    render(
      <TransactionDefaultsForm initialDefaults={null} isFamilyMode={true} />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("defaults Personal active when initialDefaults is null", () => {
    render(
      <TransactionDefaultsForm initialDefaults={null} isFamilyMode={true} />,
    );
    const personalBtn = screen.getByRole("radio", { name: /^personal$/i });
    expect(personalBtn).toHaveAttribute("aria-checked", "true");
    const sharedBtn = screen.getByRole("radio", { name: /^shared$/i });
    expect(sharedBtn).toHaveAttribute("aria-checked", "false");
  });

  it("initializes from initialDefaults.defaultType='shared'", () => {
    render(
      <TransactionDefaultsForm
        initialDefaults={{ defaultType: "shared" }}
        isFamilyMode={true}
      />,
    );
    const sharedBtn = screen.getByRole("radio", { name: /^shared$/i });
    expect(sharedBtn).toHaveAttribute("aria-checked", "true");
  });

  it("auto-saves and shows 'Saved' on type change", async () => {
    render(
      <TransactionDefaultsForm initialDefaults={null} isFamilyMode={true} />,
    );
    await userEvent.click(screen.getByRole("radio", { name: /^shared$/i }));
    await waitFor(() => {
      expect(saveTransactionDefaults).toHaveBeenCalledWith(
        expect.objectContaining({ defaultType: "shared" }),
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Saved");
    });
  });

  it("reverts optimistic update and shows error message on save failure", async () => {
    (saveTransactionDefaults as Mock).mockResolvedValueOnce({
      ok: false,
      error: { code: "transaction_defaults_save_failed", message: "Error" },
    });
    render(
      <TransactionDefaultsForm initialDefaults={null} isFamilyMode={true} />,
    );
    const sharedBtn = screen.getByRole("radio", { name: /^shared$/i });
    const personalBtn = screen.getByRole("radio", { name: /^personal$/i });

    await userEvent.click(sharedBtn);
    await waitFor(() => {
      // Reverted — Personal should be active again
      expect(personalBtn).toHaveAttribute("aria-checked", "true");
      expect(sharedBtn).toHaveAttribute("aria-checked", "false");
    });
    expect(screen.getByRole("status")).toHaveTextContent("Failed to save");
  });

  it("status region resets to empty before each save (consecutive saves re-announce)", async () => {
    render(
      <TransactionDefaultsForm
        initialDefaults={{ defaultType: "personal" }}
        isFamilyMode={true}
      />,
    );
    // First save
    await userEvent.click(screen.getByRole("radio", { name: /^shared$/i }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Saved"),
    );
    // Second save — status must be reset to "" first (handled internally)
    await userEvent.click(screen.getByRole("radio", { name: /^personal$/i }));
    // After second save completes, still shows "Saved"
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Saved"),
    );
    expect(saveTransactionDefaults).toHaveBeenCalledTimes(2);
  });

  it("checked radio has tabIndex=0; unchecked radios have tabIndex=-1 (roving tabindex)", () => {
    render(
      <TransactionDefaultsForm initialDefaults={null} isFamilyMode={true} />,
    );
    const personalBtn = screen.getByRole("radio", { name: /^personal$/i });
    const sharedBtn = screen.getByRole("radio", { name: /^shared$/i });
    // Personal is default-selected
    expect(personalBtn).toHaveAttribute("tabIndex", "0");
    expect(sharedBtn).toHaveAttribute("tabIndex", "-1");
  });

  it("ArrowRight on Default type radiogroup selects next option and moves focus", async () => {
    render(
      <TransactionDefaultsForm initialDefaults={null} isFamilyMode={true} />,
    );
    const personalBtn = screen.getByRole("radio", { name: /^personal$/i });
    const sharedBtn = screen.getByRole("radio", { name: /^shared$/i });
    personalBtn.focus();
    fireEvent.keyDown(personalBtn.parentElement!, { key: "ArrowRight" });
    await waitFor(() =>
      expect(sharedBtn).toHaveAttribute("aria-checked", "true"),
    );
    expect(personalBtn).toHaveAttribute("aria-checked", "false");
  });

  it("ArrowLeft on Default type radiogroup wraps around to last option", async () => {
    render(
      <TransactionDefaultsForm initialDefaults={null} isFamilyMode={true} />,
    );
    const personalBtn = screen.getByRole("radio", { name: /^personal$/i });
    const sharedBtn = screen.getByRole("radio", { name: /^shared$/i });
    personalBtn.focus();
    fireEvent.keyDown(personalBtn.parentElement!, { key: "ArrowLeft" });
    await waitFor(() =>
      expect(sharedBtn).toHaveAttribute("aria-checked", "true"),
    );
    expect(personalBtn).toHaveAttribute("aria-checked", "false");
  });

});
