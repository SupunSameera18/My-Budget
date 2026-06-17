import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("./ContributeSheet", () => ({
  ContributeSheet: () => null,
}));

vi.mock("./EditGoalTargetSheet", () => ({
  EditGoalTargetSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="edit-target-sheet-open" /> : null,
}));

vi.mock("./GoalHistorySheet", () => ({
  GoalHistorySheet: () => null,
}));

vi.mock("@/features/goals/server/actions", () => ({
  reclassifyGoal: vi.fn(),
}));

vi.mock("@/features/family/components/SharedBadge", () => ({
  SharedBadge: ({
    isFamilyMode,
    isShared,
    ariaLabel,
  }: {
    isFamilyMode: boolean;
    isShared: boolean;
    ariaLabel?: string;
  }) =>
    isFamilyMode && isShared ? (
      <span aria-label={ariaLabel ?? "Shared transaction"}>Shared</span>
    ) : null,
}));

import { GoalCard } from "./GoalCard";
import type { GoalWithProgress } from "@/features/goals/schema";

const baseGoal: GoalWithProgress = {
  id: "aaaaaaaa-0001-4000-8000-000000000001",
  user_id: "aaaaaaaa-0001-4000-8000-000000000099",
  name: "Emergency Fund",
  target_minor: 100000,
  currentMinor: 75000,
  remaining_minor: 25000,
  pctUsed: 75,
  created_at: "2026-06-01T00:00:00Z",
  is_shared: false,
  isOwner: true,
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

const sharedGoal: GoalWithProgress = {
  ...baseGoal,
  is_shared: true,
  isOwner: true,
  myContributionMinor: 40000,
  partnerContributionMinor: 35000,
};

const partnerSharedGoal: GoalWithProgress = {
  ...baseGoal,
  is_shared: true,
  isOwner: false,
};

describe("GoalCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders '% complete' text when pctUsed < 100", () => {
    render(<GoalCard goal={baseGoal} currency="USD" isFamilyMode={false} />);
    expect(screen.getByText("75% complete")).toBeTruthy();
  });

  it("renders 'Met!' badge when pctUsed >= 100", () => {
    render(<GoalCard goal={metGoal} currency="USD" isFamilyMode={false} />);
    expect(screen.getByText("Met!")).toBeTruthy();
  });

  it("does NOT render '% complete' when pctUsed >= 100", () => {
    render(<GoalCard goal={metGoal} currency="USD" isFamilyMode={false} />);
    expect(screen.queryByText(/% complete/)).toBeNull();
  });

  it("renders surplus amount when currentMinor > target_minor", () => {
    render(<GoalCard goal={surplusGoal} currency="USD" isFamilyMode={false} />);
    expect(screen.getByText(/over target/i)).toBeTruthy();
  });

  it("does NOT render surplus text when exactly at target", () => {
    render(<GoalCard goal={metGoal} currency="USD" isFamilyMode={false} />);
    expect(screen.queryByText(/over target/i)).toBeNull();
  });

  it("'Contribute' button is visible even when goal is met", () => {
    render(<GoalCard goal={metGoal} currency="USD" isFamilyMode={false} />);
    expect(screen.getByRole("button", { name: /contribute/i })).toBeTruthy();
  });

  it("'Edit target' button shown when isOwner=true", () => {
    render(<GoalCard goal={baseGoal} currency="USD" isFamilyMode={false} />);
    expect(screen.getByRole("button", { name: /edit target/i })).toBeTruthy();
  });

  it("'Edit target' button hidden when isOwner=false", () => {
    render(
      <GoalCard goal={partnerSharedGoal} currency="USD" isFamilyMode={true} />,
    );
    expect(screen.queryByRole("button", { name: /edit target/i })).toBeNull();
  });

  it("'Edit target' button opens EditGoalTargetSheet", async () => {
    render(<GoalCard goal={baseGoal} currency="USD" isFamilyMode={false} />);
    expect(screen.queryByTestId("edit-target-sheet-open")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /edit target/i }));
    await waitFor(() => {
      expect(screen.getByTestId("edit-target-sheet-open")).toBeTruthy();
    });
  });

  it("shows Shared badge when isFamilyMode=true and is_shared=true", () => {
    render(<GoalCard goal={sharedGoal} currency="USD" isFamilyMode={true} />);
    expect(screen.getByLabelText("Shared goal")).toBeTruthy();
  });

  it("does NOT show Shared badge in solo mode (isFamilyMode=false)", () => {
    render(<GoalCard goal={sharedGoal} currency="USD" isFamilyMode={false} />);
    expect(screen.queryByLabelText("Shared goal")).toBeNull();
  });

  it("does NOT show Shared badge for personal goal even in family mode", () => {
    render(<GoalCard goal={baseGoal} currency="USD" isFamilyMode={true} />);
    expect(screen.queryByLabelText("Shared goal")).toBeNull();
  });

  it("shows contributor breakdown for Shared Goal in family mode", () => {
    render(<GoalCard goal={sharedGoal} currency="USD" isFamilyMode={true} />);
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getByText("Partner")).toBeTruthy();
  });

  it("does NOT show contributor breakdown for Personal goal", () => {
    render(<GoalCard goal={baseGoal} currency="USD" isFamilyMode={true} />);
    expect(screen.queryByText("You")).toBeNull();
    expect(screen.queryByText("Partner")).toBeNull();
  });

  it("does NOT show contributor breakdown in solo mode", () => {
    render(<GoalCard goal={sharedGoal} currency="USD" isFamilyMode={false} />);
    expect(screen.queryByText("You")).toBeNull();
    expect(screen.queryByText("Partner")).toBeNull();
  });
});
