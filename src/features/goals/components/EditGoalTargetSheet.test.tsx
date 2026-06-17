import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { ok } from "@/lib/errors";

vi.mock("@/features/goals/server/actions", () => ({
  editGoalTarget: vi.fn(),
}));

vi.mock("@/components/feedback/OfflineRetryBanner", () => ({
  OfflineRetryBanner: () => null,
}));

vi.mock("react-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-dom")>();
  return { ...mod, useFormStatus: () => ({ pending: false }) };
});

import { EditGoalTargetSheet } from "./EditGoalTargetSheet";
import { editGoalTarget } from "@/features/goals/server/actions";

const defaultProps = {
  goalId: "aaaaaaaa-0001-4000-8000-000000000001",
  goalName: "Emergency Fund",
  currentTargetMinor: 100000,
  currency: "USD",
  open: true,
  onOpenChange: vi.fn(),
};

describe("EditGoalTargetSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (editGoalTarget as Mock).mockResolvedValue(ok());
  });

  it("renders when open=true", () => {
    render(<EditGoalTargetSheet {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/edit target for emergency fund/i)).toBeTruthy();
  });

  it("does not render dialog when open=false", () => {
    render(<EditGoalTargetSheet {...defaultProps} open={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("pre-fills input with (currentTargetMinor / 100).toFixed(2)", () => {
    render(<EditGoalTargetSheet {...defaultProps} />);
    const input = screen.getByLabelText(/target amount/i) as HTMLInputElement;
    expect(input.value).toBe("1000.00");
  });

  it("ARIA live region is always in DOM (outside open conditional)", () => {
    render(<EditGoalTargetSheet {...defaultProps} open={false} />);
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toBeTruthy();
    expect(liveRegion.getAttribute("aria-live")).toBe("polite");
  });

  it("Escape key calls onOpenChange(false) when not submitting", () => {
    const onOpenChange = vi.fn();
    render(
      <EditGoalTargetSheet {...defaultProps} onOpenChange={onOpenChange} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Escape key does NOT close when isSubmitting", async () => {
    const onOpenChange = vi.fn();
    (editGoalTarget as Mock).mockImplementation(() => new Promise(() => {}));
    render(
      <EditGoalTargetSheet {...defaultProps} onOpenChange={onOpenChange} />,
    );
    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
    });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("does not attach keydown listener when open=false", () => {
    const onOpenChange = vi.fn();
    render(
      <EditGoalTargetSheet
        {...defaultProps}
        open={false}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("successful submit calls onOpenChange(false)", async () => {
    const onOpenChange = vi.fn();
    render(
      <EditGoalTargetSheet {...defaultProps} onOpenChange={onOpenChange} />,
    );
    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("failed submit shows error status message without closing", async () => {
    const onOpenChange = vi.fn();
    (editGoalTarget as Mock).mockResolvedValue({
      ok: false,
      error: { message: "Target must be greater than current balance" },
    });
    render(
      <EditGoalTargetSheet {...defaultProps} onOpenChange={onOpenChange} />,
    );
    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
    });
    // Text appears in both the SR-only ARIA live region and the visible error paragraph.
    // Use getAllByText to handle the multiple-element case.
    const errorEls = screen.getAllByText(
      /target must be greater than current balance/i,
    );
    expect(errorEls.length).toBeGreaterThan(0);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("status message is cleared at the start of a new submission", async () => {
    (editGoalTarget as Mock)
      .mockResolvedValueOnce({
        ok: false,
        error: { message: "First attempt failed" },
      })
      .mockResolvedValueOnce({ ok: true });
    render(<EditGoalTargetSheet {...defaultProps} />);
    // First submission: error appears (may be in SR-only + visible p)
    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
    });
    expect(screen.getAllByText(/first attempt failed/i).length).toBeGreaterThan(
      0,
    );
    // Second submission: statusMessage is reset to "" — visible p is gone, SR-only is empty
    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
    });
    expect(screen.queryAllByText(/first attempt failed/i).length).toBe(0);
  });

  it("Cancel button calls onOpenChange(false)", () => {
    const onOpenChange = vi.fn();
    render(
      <EditGoalTargetSheet {...defaultProps} onOpenChange={onOpenChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("backdrop click calls onOpenChange(false) when not submitting", () => {
    const onOpenChange = vi.fn();
    render(
      <EditGoalTargetSheet {...defaultProps} onOpenChange={onOpenChange} />,
    );
    // The backdrop is the aria-hidden div immediately before the dialog
    const backdrop = document.querySelector('[aria-hidden="true"]') as Element;
    fireEvent.click(backdrop);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
