import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/features/notifications/server/push-actions", () => ({
  subscribePush: vi.fn(),
  unsubscribePush: vi.fn(),
}));

import { PushSubscriptionToggle } from "./PushSubscriptionToggle";
import {
  subscribePush,
  unsubscribePush,
} from "@/features/notifications/server/push-actions";

/* eslint-disable @typescript-eslint/no-explicit-any */
function mockServiceWorkerSupport(existingSubscription: any = null) {
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(existingSubscription),
    subscribe: vi.fn().mockResolvedValue({
      endpoint: "https://fcm.example.com/abc123",
      toJSON: () => ({
        endpoint: "https://fcm.example.com/abc123",
        keys: { p256dh: "p256dh-key", auth: "auth-secret" },
      }),
    }),
  };
  Object.defineProperty(window, "PushManager", {
    value: function () {},
    configurable: true,
  });
  Object.defineProperty(navigator, "serviceWorker", {
    value: { ready: Promise.resolve({ pushManager }) },
    configurable: true,
  });
  return pushManager;
}

function mockNotificationPermission(result: NotificationPermission) {
  Object.defineProperty(window, "Notification", {
    value: { requestPermission: vi.fn().mockResolvedValue(result) },
    configurable: true,
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
    "BHE-VIQOawK2ENYfjtvKxEja_i6yFf2VXj_SqcRwmE3FtxuGcjAt0t8xqPKwnlvDCZL17nSGaB4CBVKHtAqyOjY";
});

afterEach(() => {
  Reflect.deleteProperty(window, "PushManager");
  Reflect.deleteProperty(navigator, "serviceWorker");
  Reflect.deleteProperty(window, "Notification");
});

describe("PushSubscriptionToggle", () => {
  it("renders 'not supported' when PushManager is unavailable", async () => {
    render(<PushSubscriptionToggle />);
    expect(
      await screen.findByText(/phone alerts not supported/i),
    ).toBeInTheDocument();
  });

  it("renders 'Enable phone alerts' button when PushManager is available", async () => {
    mockServiceWorkerSupport(null);
    render(<PushSubscriptionToggle />);
    expect(
      await screen.findByRole("button", { name: /enable phone alerts/i }),
    ).toBeInTheDocument();
  });

  it("calls Notification.requestPermission() on click", async () => {
    mockServiceWorkerSupport(null);
    mockNotificationPermission("denied");
    render(<PushSubscriptionToggle />);

    const button = await screen.findByRole("button", {
      name: /enable phone alerts/i,
    });
    fireEvent.click(button);

    await waitFor(() =>
      expect(window.Notification.requestPermission).toHaveBeenCalled(),
    );
  });

  it("shows an error and does not call subscribePush when permission is denied", async () => {
    mockServiceWorkerSupport(null);
    mockNotificationPermission("denied");
    render(<PushSubscriptionToggle />);

    const button = await screen.findByRole("button", {
      name: /enable phone alerts/i,
    });
    fireEvent.click(button);

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        /permission denied/i,
      ),
    );
    expect(subscribePush).not.toHaveBeenCalled();
  });

  it("subscribes via pushManager and calls subscribePush when permission is granted", async () => {
    const pushManager = mockServiceWorkerSupport(null);
    mockNotificationPermission("granted");
    vi.mocked(subscribePush).mockResolvedValue({ ok: true, data: undefined });

    render(<PushSubscriptionToggle />);
    const button = await screen.findByRole("button", {
      name: /enable phone alerts/i,
    });
    fireEvent.click(button);

    await waitFor(() => expect(pushManager.subscribe).toHaveBeenCalled());
    await waitFor(() =>
      expect(subscribePush).toHaveBeenCalledWith({
        endpoint: "https://fcm.example.com/abc123",
        keys: { p256dh: "p256dh-key", auth: "auth-secret" },
      }),
    );
  });

  it("shows 'Phone alerts on' + Disable button on subscribePush success", async () => {
    mockServiceWorkerSupport(null);
    mockNotificationPermission("granted");
    vi.mocked(subscribePush).mockResolvedValue({ ok: true, data: undefined });

    render(<PushSubscriptionToggle />);
    const button = await screen.findByRole("button", {
      name: /enable phone alerts/i,
    });
    fireEvent.click(button);

    expect(await screen.findByText(/phone alerts on/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /disable/i }),
    ).toBeInTheDocument();
  });

  it("renders 'Phone alerts on' on mount when a subscription already exists", async () => {
    mockServiceWorkerSupport({ endpoint: "https://fcm.example.com/existing" });
    render(<PushSubscriptionToggle />);
    expect(await screen.findByText(/phone alerts on/i)).toBeInTheDocument();
  });

  it("disabling calls unsubscribePush with the current endpoint", async () => {
    const existing = {
      endpoint: "https://fcm.example.com/existing",
      unsubscribe: vi.fn().mockResolvedValue(true),
    };
    mockServiceWorkerSupport(existing);
    vi.mocked(unsubscribePush).mockResolvedValue({ ok: true, data: undefined });

    render(<PushSubscriptionToggle />);
    const disableButton = await screen.findByRole("button", {
      name: /disable/i,
    });
    fireEvent.click(disableButton);

    await waitFor(() =>
      expect(unsubscribePush).toHaveBeenCalledWith(existing.endpoint),
    );
    expect(await screen.findByText(/enable phone alerts/i)).toBeInTheDocument();
  });
});
