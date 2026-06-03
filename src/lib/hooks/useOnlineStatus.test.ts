import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, afterEach } from "vitest";
import { useOnlineStatus } from "./useOnlineStatus";

function mockNavigatorOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: vi.fn().mockReturnValue(value),
  });
}

afterEach(() => {
  // Restore navigator.onLine to jsdom default (true)
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: vi.fn().mockReturnValue(true),
  });
});

describe("useOnlineStatus", () => {
  it("returns true when navigator.onLine is true", () => {
    mockNavigatorOnline(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it("returns false when navigator.onLine is false", () => {
    mockNavigatorOnline(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it("updates to false when the offline event fires", () => {
    mockNavigatorOnline(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(result.current).toBe(false);
  });

  it("updates to true when the online event fires", () => {
    mockNavigatorOnline(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(result.current).toBe(true);
  });

  it("removes event listeners on unmount", () => {
    mockNavigatorOnline(true);
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useOnlineStatus());

    const addedOnline = addSpy.mock.calls.some(([type]) => type === "online");
    const addedOffline = addSpy.mock.calls.some(([type]) => type === "offline");
    expect(addedOnline).toBe(true);
    expect(addedOffline).toBe(true);

    unmount();

    const removedOnline = removeSpy.mock.calls.some(
      ([type]) => type === "online",
    );
    const removedOffline = removeSpy.mock.calls.some(
      ([type]) => type === "offline",
    );
    expect(removedOnline).toBe(true);
    expect(removedOffline).toBe(true);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
