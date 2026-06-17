import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

// Web Push: show a notification when a push event is received.
// Note: this file runs in the service worker's own JS context — it cannot import
// from `src/lib/...`. All push handler logic must be self-contained here.
self.addEventListener("push", (event: PushEvent) => {
  let data: { title?: string; body?: string; url?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    // Non-JSON payload — fall back to defaults rather than dropping the
    // notification entirely.
  }

  const notificationPromise = self.registration.showNotification(
    data.title ?? "My Budget",
    {
      body: data.body ?? "You have a new notification.",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      data: { url: data.url ?? "/notifications" },
      tag: "my-budget-notification", // replaces previous unread notification
    },
  );

  event.waitUntil(notificationPromise);
});

// Navigate to the notification's target URL when clicked.
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const targetUrl: string =
    (event.notification.data as { url?: string } | null)?.url ??
    "/notifications";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existingClient = clients.find((c) => c.url.includes(targetUrl));
        if (existingClient) return existingClient.focus();
        return self.clients.openWindow(targetUrl);
      }),
  );
});
