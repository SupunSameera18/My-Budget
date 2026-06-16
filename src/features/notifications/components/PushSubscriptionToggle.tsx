"use client";

import { useEffect, useState } from "react";
import {
  subscribePush,
  unsubscribePush,
} from "@/features/notifications/server/push-actions";

type ToggleState = "checking" | "unsupported" | "off" | "on";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function PushSubscriptionToggle() {
  const [state, setState] = useState<ToggleState>("checking");
  const [statusMsg, setStatusMsg] = useState("");
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkSupport() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        if (!cancelled) setState(sub ? "on" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    }

    void checkSupport();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnable() {
    setStatusMsg("");
    setIsPending(true);
    try {
      // Notification.requestPermission() must run inside this direct click
      // handler — calling it from useEffect/setTimeout is silently blocked
      // by browsers.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatusMsg("Permission denied — enable alerts in browser settings.");
        return;
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        setStatusMsg("Phone alerts are not configured.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      const result = await subscribePush(
        sub.toJSON() as {
          endpoint: string;
          keys: { p256dh: string; auth: string };
        },
      );

      if (result.ok) {
        setState("on");
        setStatusMsg("Phone alerts enabled.");
      } else {
        setStatusMsg("Failed to enable phone alerts. Please try again.");
      }
    } catch {
      setStatusMsg("Failed to enable phone alerts. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  async function handleDisable() {
    setStatusMsg("");
    setIsPending(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      const endpoint = sub?.endpoint;
      await sub?.unsubscribe();

      if (endpoint) {
        const result = await unsubscribePush(endpoint);
        if (!result.ok) {
          setStatusMsg("Failed to disable phone alerts. Please try again.");
          return;
        }
      }

      setState("off");
      setStatusMsg("Phone alerts disabled.");
    } catch {
      setStatusMsg("Failed to disable phone alerts. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-card p-4 shadow-sm">
      <div aria-live="polite" role="status" className="sr-only">
        {statusMsg}
      </div>

      {state === "unsupported" && (
        <p className="text-sm text-ink-secondary">
          Phone alerts not supported on this browser.
        </p>
      )}

      {state === "off" && (
        <button
          type="button"
          onClick={isPending ? undefined : handleEnable}
          aria-disabled={isPending ? "true" : undefined}
          disabled={isPending}
          className="min-h-[44px] rounded-md bg-brand-accent-strong px-4 text-sm font-medium text-brand-on-accent disabled:opacity-50"
        >
          Enable phone alerts
        </button>
      )}

      {state === "on" && (
        <div className="flex min-h-[44px] items-center justify-between gap-3">
          <span className="text-sm font-medium text-ink-primary">
            Phone alerts on
          </span>
          <button
            type="button"
            onClick={isPending ? undefined : handleDisable}
            aria-disabled={isPending ? "true" : undefined}
            disabled={isPending}
            className="min-h-[44px] rounded-md border border-hairline px-4 text-sm font-medium text-ink-primary disabled:opacity-50"
          >
            Disable
          </button>
        </div>
      )}
    </div>
  );
}
