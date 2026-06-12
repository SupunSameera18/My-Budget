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
});
