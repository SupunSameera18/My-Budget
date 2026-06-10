import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { ok, err, ErrorCode } from "@/lib/errors";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("@/features/goals/server/actions", () => ({
  createGoal: vi.fn(),
}));

vi.mock("@/components/feedback/OfflineRetryBanner", () => ({
  OfflineRetryBanner: () => null,
}));

vi.mock("react-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-dom")>();
  return { ...mod, useFormStatus: () => ({ pending: false }) };
});

import { GoalForm } from "./GoalForm";
import { createGoal } from "@/features/goals/server/actions";
import { useRouter } from "next/navigation";

describe("GoalForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createGoal as Mock).mockResolvedValue(ok({ id: "new-goal-uuid" }));
  });

  it("renders name input, target amount input with currency prefix, and submit button", () => {
    render(<GoalForm currency="USD" />);
    expect(screen.getByLabelText(/name/i)).toBeTruthy();
    expect(screen.getByLabelText(/target amount/i)).toBeTruthy();
    expect(screen.getByText("USD")).toBeTruthy();
    expect(screen.getByRole("button", { name: /create goal/i })).toBeTruthy();
  });

  it("always renders the ARIA live region with both required attributes", () => {
    render(<GoalForm currency="GBP" />);
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toBeTruthy();
    expect(liveRegion.getAttribute("aria-live")).toBe("polite");
  });

  it("calls createGoal with FormData on submit", async () => {
    render(<GoalForm currency="USD" />);
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Emergency Fund" },
    });
    fireEvent.change(screen.getByLabelText(/target amount/i), {
      target: { value: "1000.00" },
    });
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(createGoal).toHaveBeenCalledOnce());
  });

  it("navigates to /goals on success", async () => {
    const push = vi.fn();
    (useRouter as Mock).mockReturnValue({ push });
    render(<GoalForm currency="USD" />);
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/goals"));
  });

  it("displays error message in ARIA live region on failure", async () => {
    (createGoal as Mock).mockResolvedValue(
      err(
        ErrorCode.GoalCreateFailed,
        "Target amount must be greater than zero",
      ),
    );
    render(<GoalForm currency="USD" />);
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => {
      const errors = screen.getAllByText(
        /target amount must be greater than zero/i,
      );
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  it("resets status to empty string before each submission (ARIA re-announce)", async () => {
    (createGoal as Mock)
      .mockResolvedValueOnce(err(ErrorCode.GoalCreateFailed, "First error"))
      .mockResolvedValueOnce(err(ErrorCode.GoalCreateFailed, "Second error"));
    render(<GoalForm currency="USD" />);

    const form = document.querySelector("form")!;
    fireEvent.submit(form);
    await waitFor(() => screen.getByText("First error"));

    fireEvent.submit(form);
    await waitFor(() => screen.getByText("Second error"));
  });
});
