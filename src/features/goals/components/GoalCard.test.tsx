import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("./ContributeSheet", () => ({
  ContributeSheet: () => null,
}));

vi.mock("./EditGoalTargetSheet", () => ({
  EditGoalTargetSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="edit-target-sheet-open" /> : null,
}));

import { GoalCard } from "./GoalCard";
import type { GoalWithProgress } from "@/features/goals/schema";

const baseGoal: GoalWithProgress = {
  id: "aaaaaaaa-0001-4000-8000-000000000001",
  name: "Emergency Fund",
  target_minor: 100000,
  currentMinor: 75000,
  remaining_minor: 25000,
  pctUsed: 75,
  created_at: "2026-06-01T00:00:00Z",
};

const metGoal: GoalWithProgress = {
  ...baseGoal,
  currentMinor: 100000,
  remaining_minor: 0,
  pctUsed: 100,
};

const surplusGoal: GoalWithProgress = {
  ...baseGoal,
  currentMinor: 120000,
  remaining_minor: -20000,
  pctUsed: 120,
};

describe("GoalCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders '% complete' text when pctUsed < 100", () => {
    render(<GoalCard goal={baseGoal} currency="USD" />);
    expect(screen.getByText("75% complete")).toBeTruthy();
  });

  it("renders 'Met!' badge when pctUsed >= 100", () => {
    render(<GoalCard goal={metGoal} currency="USD" />);
    expect(screen.getByText("Met!")).toBeTruthy();
  });

  it("does NOT render '% complete' when pctUsed >= 100", () => {
    render(<GoalCard goal={metGoal} currency="USD" />);
    expect(screen.queryByText(/% complete/)).toBeNull();
  });

  it("renders surplus amount when currentMinor > target_minor", () => {
    render(<GoalCard goal={surplusGoal} currency="USD" />);
    expect(screen.getByText(/over target/i)).toBeTruthy();
  });

  it("does NOT render surplus text when exactly at target", () => {
    render(<GoalCard goal={metGoal} currency="USD" />);
    expect(screen.queryByText(/over target/i)).toBeNull();
  });

  it("'Contribute' button is visible even when goal is met", () => {
    render(<GoalCard goal={metGoal} currency="USD" />);
    expect(screen.getByRole("button", { name: /contribute/i })).toBeTruthy();
  });

  it("'Edit target' button is present on the card", () => {
    render(<GoalCard goal={baseGoal} currency="USD" />);
    expect(screen.getByRole("button", { name: /edit target/i })).toBeTruthy();
  });

  it("'Edit target' button is visible even when goal is met", () => {
    render(<GoalCard goal={metGoal} currency="USD" />);
    expect(screen.getByRole("button", { name: /edit target/i })).toBeTruthy();
  });

  it("'Edit target' button opens EditGoalTargetSheet", async () => {
    render(<GoalCard goal={baseGoal} currency="USD" />);
    expect(screen.queryByTestId("edit-target-sheet-open")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /edit target/i }));
    await waitFor(() => {
      expect(screen.getByTestId("edit-target-sheet-open")).toBeTruthy();
    });
  });
});
