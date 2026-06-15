import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { JoinFamilyForm } from "./JoinFamilyForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/features/family/server/actions", () => ({
  getInvitePreview: vi.fn(),
  redeemInviteCode: vi.fn(),
}));

import {
  getInvitePreview,
  redeemInviteCode,
} from "@/features/family/server/actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getInvitePreview).mockResolvedValue({
    ok: true,
    data: { creatorName: "alice@test.local" },
  });
  vi.mocked(redeemInviteCode).mockResolvedValue({ ok: true, data: undefined });
});

function fillAndSubmitCode(code = "testcode123") {
  const input = screen.getByLabelText(/enter the invite code/i);
  fireEvent.change(input, { target: { value: code } });
  const form = input.closest("form")!;
  fireEvent.submit(form);
}

describe("JoinFamilyForm — code input", () => {
  it("renders code input and submit button", () => {
    render(<JoinFamilyForm />);
    expect(screen.getByLabelText(/enter the invite code/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /join family/i }),
    ).toBeInTheDocument();
  });

  it("calls getInvitePreview on form submit", async () => {
    render(<JoinFamilyForm />);
    fillAndSubmitCode("mycode");

    await waitFor(() => {
      expect(getInvitePreview).toHaveBeenCalledWith("mycode");
    });
  });

  it("shows error in ARIA live region when preview fails", async () => {
    vi.mocked(getInvitePreview).mockResolvedValue({
      ok: false,
      error: {
        code: "invite_not_found" as never,
        message: "Invalid or expired code",
      },
    });

    render(<JoinFamilyForm />);
    fillAndSubmitCode("badcode");

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Invalid or expired code",
      );
    });
  });
});

describe("JoinFamilyForm — confirmation dialog", () => {
  it("shows confirmation dialog with partner name after valid code", async () => {
    render(<JoinFamilyForm />);
    fillAndSubmitCode("validcode");

    await waitFor(() => {
      expect(screen.getByRole("dialog")).not.toHaveAttribute("hidden");
      expect(screen.getByText(/alice@test\.local/i)).toBeInTheDocument();
    });
  });

  it("cancel button closes the dialog", async () => {
    render(<JoinFamilyForm />);
    fillAndSubmitCode("validcode");

    await waitFor(() => screen.getByRole("dialog"));

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { hidden: true })).toHaveAttribute(
        "hidden",
      );
    });
  });

  it("Escape key closes the dialog", async () => {
    render(<JoinFamilyForm />);
    fillAndSubmitCode("validcode");

    await waitFor(() => screen.getByRole("dialog"));

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(screen.getByRole("dialog", { hidden: true })).toHaveAttribute(
      "hidden",
    );
  });

  it("'Join family' button in dialog calls redeemInviteCode", async () => {
    render(<JoinFamilyForm />);
    fillAndSubmitCode("validcode");

    await waitFor(() => screen.getByRole("dialog"));

    // Click the "Join family" button inside the dialog
    const confirmBtn = screen
      .getAllByRole("button", { name: /join family/i })
      .find((b) => b.closest("[role='dialog']"))!;
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(redeemInviteCode).toHaveBeenCalledWith("validcode");
    });
  });

  it("shows redemption error in live region when redeem fails", async () => {
    vi.mocked(redeemInviteCode).mockResolvedValue({
      ok: false,
      error: {
        code: "invite_rate_limit_exceeded" as never,
        message: "Too many failed attempts",
      },
    });

    render(<JoinFamilyForm />);
    fillAndSubmitCode("validcode");

    await waitFor(() => screen.getByRole("dialog"));

    const confirmBtn = screen
      .getAllByRole("button", { name: /join family/i })
      .find((b) => b.closest("[role='dialog']"))!;
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Too many failed attempts",
      );
    });
  });

  it("dialog is always in the DOM (unconditionally mounted)", () => {
    render(<JoinFamilyForm />);
    // dialog element must exist in DOM even before code is entered
    expect(screen.getByRole("dialog", { hidden: true })).toBeInTheDocument();
  });

  it("ARIA live region is always in the DOM", () => {
    render(<JoinFamilyForm />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
