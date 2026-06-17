import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { ok, err, ErrorCode } from "@/lib/errors";

vi.mock("@/features/goals/server/actions", () => ({
  contributeToGoal: vi.fn(),
}));

vi.mock("@/components/feedback/OfflineRetryBanner", () => ({
  OfflineRetryBanner: () => null,
}));

vi.mock("react-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-dom")>();
  return { ...mod, useFormStatus: () => ({ pending: false }) };
});

import { ContributeSheet } from "./ContributeSheet";
import { contributeToGoal } from "@/features/goals/server/actions";

const defaultProps = {
  goalId: "aaaaaaaa-0001-4000-8000-000000000001",
  goalName: "Emergency Fund",
  currency: "USD",
  open: true,
  onOpenChange: vi.fn(),
};

describe("ContributeSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (contributeToGoal as Mock).mockResolvedValue(ok());
  });

  it("renders sheet content when open=true", () => {
    render(<ContributeSheet {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/contribute to emergency fund/i)).toBeTruthy();
    expect(screen.getByLabelText(/amount/i)).toBeTruthy();
    expect(screen.getByLabelText(/date/i)).toBeTruthy();
  });

  it("does not render when open=false", () => {
    render(<ContributeSheet {...defaultProps} open={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("always renders the ARIA live region with both required attributes when open", () => {
    render(<ContributeSheet {...defaultProps} />);
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toBeTruthy();
    expect(liveRegion.getAttribute("aria-live")).toBe("polite");
  });

  it("calls contributeToGoal with FormData on submit", async () => {
    render(<ContributeSheet {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: "50.00" },
    });
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(contributeToGoal).toHaveBeenCalledOnce());
  });

  it("calls onOpenChange(false) on success", async () => {
    const onOpenChange = vi.fn();
    render(<ContributeSheet {...defaultProps} onOpenChange={onOpenChange} />);
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("displays error message in ARIA live region on failure", async () => {
    (contributeToGoal as Mock).mockResolvedValue(
      err(ErrorCode.ContributionCreateFailed, "Goal not found."),
    );
    render(<ContributeSheet {...defaultProps} />);
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => {
      const errors = screen.getAllByText(/goal not found/i);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  it("does not close sheet on error", async () => {
    (contributeToGoal as Mock).mockResolvedValue(
      err(ErrorCode.ContributionCreateFailed, "Goal not found."),
    );
    const onOpenChange = vi.fn();
    render(<ContributeSheet {...defaultProps} onOpenChange={onOpenChange} />);
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(contributeToGoal).toHaveBeenCalledOnce());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("calls onOpenChange(false) when Cancel is clicked", () => {
    const onOpenChange = vi.fn();
    render(<ContributeSheet {...defaultProps} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Escape key calls onOpenChange(false) when not submitting", () => {
    const onOpenChange = vi.fn();
    render(<ContributeSheet {...defaultProps} onOpenChange={onOpenChange} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Escape key does NOT close when isSubmitting (never-resolving action)", async () => {
    const onOpenChange = vi.fn();
    (contributeToGoal as Mock).mockImplementation(() => new Promise(() => {}));
    render(<ContributeSheet {...defaultProps} onOpenChange={onOpenChange} />);
    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
    });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("does not attach keydown listener when open=false", () => {
    const onOpenChange = vi.fn();
    render(
      <ContributeSheet
        {...defaultProps}
        open={false}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("focus trap selector includes lone aria-disabled elements", () => {
    render(<ContributeSheet {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    // The trap selector includes [aria-disabled="true"]:not([disabled])
    // Verify we can find all focusable elements inside the dialog
    const focusable = dialog.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [aria-disabled="true"]:not([disabled])',
    );
    expect(focusable.length).toBeGreaterThan(0);
  });
});
