import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { ok, err, ErrorCode } from "@/lib/errors";

vi.mock("@/features/dashboard/server/actions", () => ({
  getBreathingRoomData: vi.fn(),
}));

import { BreathingRoomCard } from "./BreathingRoomCard";
import { getBreathingRoomData } from "@/features/dashboard/server/actions";

const defaultData = {
  breathingRoomMinor: 110000,
  committedSlackMinor: 20000,
  currency: "USD",
  hasActivity: true,
};

describe("BreathingRoomCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getBreathingRoomData as Mock).mockResolvedValue(ok(defaultData));
  });

  it("renders formatted value when hasActivity is true", async () => {
    const jsx = await BreathingRoomCard();
    render(jsx!);
    expect(screen.getByText("$1,100.00")).toBeTruthy();
    expect(screen.getByText("left to spend this month")).toBeTruthy();
  });

  it("renders empty state when hasActivity is false", async () => {
    (getBreathingRoomData as Mock).mockResolvedValue(
      ok({ ...defaultData, hasActivity: false, breathingRoomMinor: 0 }),
    );
    const jsx = await BreathingRoomCard();
    render(jsx!);
    expect(screen.getByText("Nothing tracked yet this month.")).toBeTruthy();
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("renders nothing when getBreathingRoomData returns an error", async () => {
    (getBreathingRoomData as Mock).mockResolvedValue(
      err(ErrorCode.BreathingRoomFetchFailed, "Failed"),
    );
    const jsx = await BreathingRoomCard();
    expect(jsx).toBeNull();
  });

  it("applies amber text class to amount when breathingRoomMinor is negative", async () => {
    (getBreathingRoomData as Mock).mockResolvedValue(
      ok({ ...defaultData, breathingRoomMinor: -5000 }),
    );
    const jsx = await BreathingRoomCard();
    render(jsx!);
    const amount = screen.getByText("-$50.00");
    expect(amount.className).toContain("text-breathing-low-text");
  });

  it("does not apply amber text class when breathingRoomMinor is non-negative", async () => {
    const jsx = await BreathingRoomCard();
    render(jsx!);
    const amount = screen.getByText("$1,100.00");
    expect(amount.className).toContain("text-ink-primary");
    expect(amount.className).not.toContain("text-breathing-low-text");
  });
});
