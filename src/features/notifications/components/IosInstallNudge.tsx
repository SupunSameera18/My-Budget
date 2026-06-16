"use client";

import { useEffect, useState } from "react";

const DISMISSED_KEY = "ios_nudge_dismissed";

function isIosStandalone(): boolean {
  const isIos =
    navigator.userAgent.includes("iPhone") ||
    navigator.userAgent.includes("iPad");
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
  return isIos && !isStandalone;
}

export function IosInstallNudge() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isIosStandalone()) return;
    if (localStorage.getItem(DISMISSED_KEY) === "true") return;
    setShow(true);
  }, []);

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, "true");
    setShow(false);
  }

  return (
    <div aria-live="polite">
      {show && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-card p-4 shadow-sm">
          <p className="text-sm text-ink-primary">
            Add My Budget to your Home Screen for phone alerts (iOS 16.4+
            required)
          </p>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="min-h-[44px] min-w-[44px] shrink-0 text-sm font-medium text-ink-secondary"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
