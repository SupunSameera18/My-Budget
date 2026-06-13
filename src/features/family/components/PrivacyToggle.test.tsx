import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PrivacyToggle } from "./PrivacyToggle";
import { ErrorCode } from "@/lib/errors";

vi.mock("@/features/family/server/actions", () => ({
  updatePrivacyToggle: vi.fn(),
}));

import { updatePrivacyToggle } from "@/features/family/server/actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updatePrivacyToggle).mockResolvedValue({
    ok: true,
    data: undefined,
  });
});

describe("PrivacyToggle — rendering", () => {
  it("renders the checkbox with initial value false", () => {
    render(<PrivacyToggle initialValue={false} isFamilyMode={true} />);
    const checkbox = screen.getByRole("switch");
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toHaveAttribute("aria-checked", "false");
  });

  it("renders the checkbox with initial value true", () => {
    render(<PrivacyToggle initialValue={true} isFamilyMode={true} />);
    const checkbox = screen.getByRole("switch");
    expect(checkbox).toBeChecked();
    expect(checkbox).toHaveAttribute("aria-checked", "true");
  });

  it("shows helper text with aria-describedby", () => {
    render(<PrivacyToggle initialValue={false} isFamilyMode={true} />);
    const checkbox = screen.getByRole("switch");
    expect(checkbox).toHaveAttribute("aria-describedby", "privacy-toggle-hint");
    expect(screen.getByText(/when on, neither of you/i)).toBeInTheDocument();
  });

  it("aria-live region is always mounted regardless of isFamilyMode", () => {
    const { rerender } = render(
      <PrivacyToggle initialValue={false} isFamilyMode={false} />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();

    rerender(<PrivacyToggle initialValue={false} isFamilyMode={true} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("section is hidden when isFamilyMode=false", () => {
    render(<PrivacyToggle initialValue={false} isFamilyMode={false} />);
    // The section should have the hidden attribute
    const section = document.querySelector("section");
    expect(section).toHaveAttribute("hidden");
  });

  it("section is not hidden when isFamilyMode=true", () => {
    render(<PrivacyToggle initialValue={false} isFamilyMode={true} />);
    const section = document.querySelector("section");
    expect(section).not.toHaveAttribute("hidden");
  });
});

describe("PrivacyToggle — optimistic update", () => {
  it("flips checkbox immediately on click (optimistic)", async () => {
    render(<PrivacyToggle initialValue={false} isFamilyMode={true} />);
    const checkbox = screen.getByRole("switch");

    fireEvent.click(checkbox);

    // Optimistic flip: should show checked before server responds
    expect(checkbox).toBeChecked();
    expect(checkbox).toHaveAttribute("aria-checked", "true");

    await waitFor(() => {
      expect(updatePrivacyToggle).toHaveBeenCalledWith(true);
    });
  });

  it("reverts to previous state when server returns error", async () => {
    vi.mocked(updatePrivacyToggle).mockResolvedValue({
      ok: false,
      error: { code: ErrorCode.PrivacyToggleFailed, message: "Failed" },
    });

    render(<PrivacyToggle initialValue={false} isFamilyMode={true} />);
    const checkbox = screen.getByRole("switch");

    fireEvent.click(checkbox);

    await waitFor(() => {
      // Reverted back to false
      expect(checkbox).not.toBeChecked();
      expect(checkbox).toHaveAttribute("aria-checked", "false");
    });
  });

  it("shows error message in aria-live region on failure", async () => {
    vi.mocked(updatePrivacyToggle).mockResolvedValue({
      ok: false,
      error: { code: ErrorCode.PrivacyToggleFailed, message: "Failed" },
    });

    render(<PrivacyToggle initialValue={false} isFamilyMode={true} />);

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Failed to update privacy setting. Please try again.",
      );
    });
  });

  it("resets aria-live message before firing action (§9 consecutive re-announce)", async () => {
    vi.mocked(updatePrivacyToggle)
      .mockResolvedValueOnce({
        ok: false,
        error: { code: ErrorCode.PrivacyToggleFailed, message: "Failed" },
      })
      .mockResolvedValueOnce({ ok: true, data: undefined });

    render(<PrivacyToggle initialValue={false} isFamilyMode={true} />);
    const checkbox = screen.getByRole("switch");

    // First click → error
    fireEvent.click(checkbox);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Failed to update privacy setting",
      ),
    );

    // Second click → status reset to "" before server call
    fireEvent.click(checkbox);
    expect(screen.getByRole("status")).toHaveTextContent("");
  });
});

describe("PrivacyToggle — accessibility", () => {
  it("disables checkbox when pending and sets aria-disabled", async () => {
    // Never-resolving promise keeps isPending=true
    vi.mocked(updatePrivacyToggle).mockImplementation(
      () => new Promise(() => {}),
    );

    render(<PrivacyToggle initialValue={false} isFamilyMode={true} />);
    const checkbox = screen.getByRole("switch");

    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(checkbox).toBeDisabled();
      expect(checkbox).toHaveAttribute("aria-disabled", "true");
    });
  });
});
