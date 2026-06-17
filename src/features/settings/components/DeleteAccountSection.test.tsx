import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { DeleteAccountSection } from "./DeleteAccountSection";

const mockReplace = vi.fn();
const mockSignOut = vi.fn().mockResolvedValue({});
const mockGetSession = vi.fn().mockResolvedValue({
  data: { session: { access_token: "test-jwt" } },
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
      signOut: mockSignOut,
    },
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("DeleteAccountSection", () => {
  const userEmail = "test@example.com";

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "test-jwt" } },
    });
    mockSignOut.mockResolvedValue({});
  });

  it("renders the Delete Account heading and email input", () => {
    render(<DeleteAccountSection userEmail={userEmail} />);
    expect(
      screen.getByRole("heading", { name: /delete account/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/confirm your email address/i),
    ).toBeInTheDocument();
  });

  it("Delete Account button is aria-disabled until email matches", () => {
    render(<DeleteAccountSection userEmail={userEmail} />);
    const btn = screen.getByRole("button", { name: /delete account/i });
    expect(btn).toHaveAttribute("aria-disabled", "true");
  });

  it("shows email mismatch error when input doesn't match", () => {
    render(<DeleteAccountSection userEmail={userEmail} />);
    fireEvent.change(screen.getByLabelText(/confirm your email address/i), {
      target: { value: "wrong@email.com" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      /email does not match/i,
    );
  });

  it("button becomes active when email matches", () => {
    render(<DeleteAccountSection userEmail={userEmail} />);
    fireEvent.change(screen.getByLabelText(/confirm your email address/i), {
      target: { value: userEmail },
    });
    const btn = screen.getByRole("button", { name: /delete account/i });
    expect(btn).not.toHaveAttribute("aria-disabled");
  });

  it("button becomes active when email matches with different casing (W3 — case-insensitive gate)", () => {
    render(<DeleteAccountSection userEmail={userEmail} />);
    fireEvent.change(screen.getByLabelText(/confirm your email address/i), {
      target: { value: userEmail.toUpperCase() },
    });
    const btn = screen.getByRole("button", { name: /delete account/i });
    expect(btn).not.toHaveAttribute("aria-disabled");
  });

  it("shows alertdialog when Delete Account button is clicked with matching email", () => {
    render(<DeleteAccountSection userEmail={userEmail} />);
    fireEvent.change(screen.getByLabelText(/confirm your email address/i), {
      target: { value: userEmail },
    });
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));
    const dialog = screen.getByRole("alertdialog", { hidden: true });
    expect(dialog).not.toHaveAttribute("hidden");
  });

  it("alertdialog is always in the DOM (hidden attribute present when closed)", () => {
    render(<DeleteAccountSection userEmail={userEmail} />);
    const dialog = screen.getByRole("alertdialog", { hidden: true });
    expect(dialog).toHaveAttribute("hidden");
  });

  it("Cancel button closes the alertdialog", () => {
    render(<DeleteAccountSection userEmail={userEmail} />);
    fireEvent.change(screen.getByLabelText(/confirm your email address/i), {
      target: { value: userEmail },
    });
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    const dialog = screen.getByRole("alertdialog", { hidden: true });
    expect(dialog).toHaveAttribute("hidden");
  });

  it("Escape key closes the alertdialog", async () => {
    render(<DeleteAccountSection userEmail={userEmail} />);
    fireEvent.change(screen.getByLabelText(/confirm your email address/i), {
      target: { value: userEmail },
    });
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    const dialog = screen.getByRole("alertdialog", { hidden: true });
    expect(dialog).toHaveAttribute("hidden");
  });

  it("calls Edge Function and redirects to /goodbye on success", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    render(<DeleteAccountSection userEmail={userEmail} />);
    fireEvent.change(screen.getByLabelText(/confirm your email address/i), {
      target: { value: userEmail },
    });
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /delete my account permanently/i }),
      );
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/functions/v1/erase-account"),
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/goodbye");
  });

  it("shows a timeout-specific message when the request is aborted (W2 hardening)", async () => {
    mockFetch.mockImplementationOnce(() => {
      const err = new DOMException("The operation was aborted", "AbortError");
      return Promise.reject(err);
    });

    render(<DeleteAccountSection userEmail={userEmail} />);
    fireEvent.change(screen.getByLabelText(/confirm your email address/i), {
      target: { value: userEmail },
    });
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /delete my account permanently/i }),
      );
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/took too long/i);
  });

  it("shows error message and stays on page when Edge Function returns error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: "Erasure failed." }),
    });

    render(<DeleteAccountSection userEmail={userEmail} />);
    fireEvent.change(screen.getByLabelText(/confirm your email address/i), {
      target: { value: userEmail },
    });
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /delete my account permanently/i }),
      );
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/erasure failed/i);
  });
});
