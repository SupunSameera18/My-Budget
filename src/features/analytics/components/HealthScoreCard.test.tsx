import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";

vi.mock("@/features/analytics/server/actions", () => ({
  getHealthScore: vi.fn(),
}));

import { HealthScoreCard } from "./HealthScoreCard";
import { getHealthScore } from "@/features/analytics/server/actions";

describe("HealthScoreCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'Keep logging to see your score' when hasEnoughData=false", async () => {
    (getHealthScore as Mock).mockResolvedValue({
      score: 0,
      confidencePercent: 0,
      hasEnoughData: false,
    });
    const jsx = await HealthScoreCard();
    render(jsx!);
    expect(screen.getByText("Keep logging to see your score")).toBeTruthy();
  });

  it("renders score number when hasEnoughData=true and score=89", async () => {
    (getHealthScore as Mock).mockResolvedValue({
      score: 89,
      confidencePercent: 74,
      hasEnoughData: true,
    });
    const jsx = await HealthScoreCard();
    render(jsx!);
    expect(screen.getByText("89")).toBeTruthy();
  });

  it("renders ProgressBar when hasEnoughData=true", async () => {
    (getHealthScore as Mock).mockResolvedValue({
      score: 89,
      confidencePercent: 74,
      hasEnoughData: true,
    });
    const jsx = await HealthScoreCard();
    render(jsx!);
    expect(
      screen.getByRole("progressbar", { name: /confidence/i }),
    ).toBeTruthy();
  });

  it("renders null when getHealthScore returns null", async () => {
    (getHealthScore as Mock).mockResolvedValue(null);
    const jsx = await HealthScoreCard();
    expect(jsx).toBeNull();
  });

  it("confidence bar shows 0 progress when hasEnoughData=false, confidencePercent=0", async () => {
    (getHealthScore as Mock).mockResolvedValue({
      score: 0,
      confidencePercent: 0,
      hasEnoughData: false,
    });
    const jsx = await HealthScoreCard();
    render(jsx!);
    const bar = screen.getByRole("progressbar", { name: /confidence/i });
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
  });
});
