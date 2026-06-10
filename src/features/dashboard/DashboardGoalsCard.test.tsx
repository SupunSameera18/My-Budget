import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { ok, err, ErrorCode } from "@/lib/errors";
import type { GoalWithProgress } from "@/features/goals/schema";

vi.mock("@/features/goals/server/actions", () => ({
  getGoals: vi.fn(),
}));

import { DashboardGoalsCard } from "./DashboardGoalsCard";
import { getGoals } from "@/features/goals/server/actions";

function makeGoal(overrides: Partial<GoalWithProgress>): GoalWithProgress {
  return {
    id: overrides.id ?? "goal-1",
    name: overrides.name ?? "Goal",
    target_minor: overrides.target_minor ?? 100000,
    currentMinor: overrides.currentMinor ?? 0,
    remaining_minor: overrides.remaining_minor ?? 100000,
    pctUsed: overrides.pctUsed ?? 0,
    created_at: "2026-06-01T00:00:00Z",
  };
}

const fourGoals: GoalWithProgress[] = [
  makeGoal({
    id: "g1",
    name: "Emergency Fund",
    pctUsed: 90,
    currentMinor: 90000,
    remaining_minor: 10000,
  }),
  makeGoal({
    id: "g2",
    name: "Vacation",
    pctUsed: 55,
    currentMinor: 55000,
    remaining_minor: 45000,
  }),
  makeGoal({
    id: "g3",
    name: "New Car",
    pctUsed: 70,
    currentMinor: 70000,
    remaining_minor: 30000,
  }),
  makeGoal({
    id: "g4",
    name: "Gadget",
    pctUsed: 20,
    currentMinor: 20000,
    remaining_minor: 80000,
  }),
];

describe("DashboardGoalsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getGoals as Mock).mockResolvedValue(ok({ goals: [], currency: "USD" }));
  });

  it("returns null when getGoals returns an error", async () => {
    (getGoals as Mock).mockResolvedValue(
      err(ErrorCode.GoalFetchFailed, "DB error"),
    );
    const jsx = await DashboardGoalsCard();
    expect(jsx).toBeNull();
  });

  it("renders compact prompt card when no goals", async () => {
    (getGoals as Mock).mockResolvedValue(ok({ goals: [], currency: "USD" }));
    const jsx = await DashboardGoalsCard();
    render(jsx!);
    expect(screen.getByText(/No goals yet\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create one" })).toBeTruthy();
  });

  it("renders top 3 goals sorted by pctUsed descending", async () => {
    (getGoals as Mock).mockResolvedValue(
      ok({ goals: fourGoals, currency: "USD" }),
    );
    const jsx = await DashboardGoalsCard();
    render(jsx!);
    // Shows Emergency Fund (90%), New Car (70%), Vacation (55%) — NOT Gadget (20%)
    expect(screen.getByText("Emergency Fund")).toBeTruthy();
    expect(screen.getByText("New Car")).toBeTruthy();
    expect(screen.getByText("Vacation")).toBeTruthy();
    expect(screen.queryByText("Gadget")).toBeNull();
  });

  it("shows '+N more' text when totalGoals > 3", async () => {
    (getGoals as Mock).mockResolvedValue(
      ok({ goals: fourGoals, currency: "USD" }),
    );
    const jsx = await DashboardGoalsCard();
    render(jsx!);
    expect(screen.getByText(/\+1 more/)).toBeTruthy();
  });

  it("does not show '+N more' when totalGoals <= 3", async () => {
    (getGoals as Mock).mockResolvedValue(
      ok({ goals: fourGoals.slice(0, 3), currency: "USD" }),
    );
    const jsx = await DashboardGoalsCard();
    render(jsx!);
    expect(screen.queryByText(/more/)).toBeNull();
  });

  it("shows 'Met!' badge for a goal with pctUsed >= 100", async () => {
    const metGoal = makeGoal({
      id: "g-met",
      name: "Met Goal",
      pctUsed: 100,
      currentMinor: 100000,
      remaining_minor: 0,
    });
    (getGoals as Mock).mockResolvedValue(
      ok({ goals: [metGoal], currency: "USD" }),
    );
    const jsx = await DashboardGoalsCard();
    render(jsx!);
    expect(screen.getByText("Met!")).toBeTruthy();
    expect(screen.queryByText(/100%/)).toBeNull();
  });

  it("shows % text for an unmet goal", async () => {
    const unmetGoal = makeGoal({
      id: "g-unmet",
      name: "Unmet Goal",
      pctUsed: 75,
    });
    (getGoals as Mock).mockResolvedValue(
      ok({ goals: [unmetGoal], currency: "USD" }),
    );
    const jsx = await DashboardGoalsCard();
    render(jsx!);
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.queryByText("Met!")).toBeNull();
  });
});
