import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock Supabase client — returns a controllable channel object
const mockOn = vi.fn();
const mockSubscribe = vi.fn();
const mockRemoveChannel = vi.fn();
const mockChannelFactory = vi.fn();

const mockChannel = {
  on: mockOn,
  subscribe: mockSubscribe,
};

mockOn.mockReturnValue(mockChannel);
mockSubscribe.mockReturnValue(mockChannel);
mockChannelFactory.mockReturnValue(mockChannel);

const mockSupabase = {
  channel: mockChannelFactory,
  removeChannel: mockRemoveChannel,
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

import { useFamilyRealtime } from "./useFamilyRealtime";

describe("useFamilyRealtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOn.mockReturnValue(mockChannel);
    mockSubscribe.mockReturnValue(mockChannel);
    mockChannelFactory.mockReturnValue(mockChannel);
  });

  it("does not subscribe when familyUnitId is null", () => {
    renderHook(() => useFamilyRealtime(null));
    expect(mockChannelFactory).not.toHaveBeenCalled();
  });

  it("subscribes to family:{familyUnitId} channel on mount (AC 7)", () => {
    renderHook(() => useFamilyRealtime("test-family-id"));
    expect(mockChannelFactory).toHaveBeenCalledWith("family:test-family-id");
  });

  it("subscribes with filter 'is_shared=eq.true' (AC 9)", () => {
    renderHook(() => useFamilyRealtime("test-family-id"));
    const onCall = mockOn.mock.calls[0];
    expect(onCall).toBeDefined();
    const eventConfig = onCall[1] as { filter?: string };
    expect(eventConfig?.filter).toBe("is_shared=eq.true");
  });

  it("returns lastEventAt = 0 initially", () => {
    const { result } = renderHook(() => useFamilyRealtime("test-family-id"));
    expect(result.current.lastEventAt).toBe(0);
  });

  it("updates lastEventAt when channel fires a postgres_changes event (AC 11)", () => {
    const { result } = renderHook(() => useFamilyRealtime("test-family-id"));
    const payloadCallback = mockOn.mock.calls[0][2] as () => void;

    act(() => {
      payloadCallback();
    });

    expect(result.current.lastEventAt).toBeGreaterThan(0);
  });

  it("removes channel on unmount (AC 12 graceful teardown)", () => {
    const { unmount } = renderHook(() => useFamilyRealtime("test-family-id"));
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
  });

  it("logs a warning on CHANNEL_ERROR without throwing (AC 12 graceful degradation)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderHook(() => useFamilyRealtime("test-family-id"));

    const statusCallback = mockSubscribe.mock.calls[0][0] as (
      status: string,
    ) => void;
    act(() => {
      statusCallback("CHANNEL_ERROR");
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Family Realtime channel error"),
    );
    warnSpy.mockRestore();
  });

  it("non-error status (SUBSCRIBED) does not log a warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderHook(() => useFamilyRealtime("test-family-id"));

    const statusCallback = mockSubscribe.mock.calls[0][0] as (
      status: string,
    ) => void;
    act(() => {
      statusCallback("SUBSCRIBED");
    });

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("stale-data guard: changing familyUnitId tears down old channel and subscribes to new one", () => {
    const { rerender } = renderHook(
      ({ id }: { id: string | null }) => useFamilyRealtime(id),
      { initialProps: { id: "family-id-1" as string | null } },
    );

    expect(mockChannelFactory).toHaveBeenCalledTimes(1);
    expect(mockChannelFactory).toHaveBeenCalledWith("family:family-id-1");

    // Rerender with a new family ID (simulates partner switching family unit)
    rerender({ id: "family-id-2" });

    // Old channel should be removed
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
    // New channel should be created
    expect(mockChannelFactory).toHaveBeenCalledWith("family:family-id-2");
    expect(mockChannelFactory).toHaveBeenCalledTimes(2);
  });

  it("no-leak: switching to null familyUnitId removes the existing channel", () => {
    const { rerender } = renderHook(
      ({ id }: { id: string | null }) => useFamilyRealtime(id),
      { initialProps: { id: "family-id-1" as string | null } },
    );

    // Transition to null (family dissolved or user not in family)
    rerender({ id: null });

    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
    // No new channel created for null
    expect(mockChannelFactory).toHaveBeenCalledTimes(1);
  });
});
