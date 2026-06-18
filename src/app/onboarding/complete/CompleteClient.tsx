"use client";

import { useEffect, useRef } from "react";
import { posthog } from "@/lib/analytics/posthog";

export function CompleteClient({ userId }: { userId: string }) {
  const firedRef = useRef(false);

  useEffect(() => {
    // Guard against double-fire from React StrictMode (effects run twice in dev).
    // window.location.replace is used instead of router.replace + setTimeout
    // because React StrictMode cancels the cleanup-cancellable timeout before it
    // fires, leaving the user stuck on this screen.
    if (firedRef.current) return;
    firedRef.current = true;

    posthog.capture(
      "onboarding_completed",
      { user_id: userId, surface: "onboarding" },
      { send_instantly: true },
    );
    window.location.replace("/dashboard");
  }, [userId]);

  return (
    <div className="flex min-h-dvh items-center justify-center p-8">
      <p className="text-sm text-ink-secondary">
        You&apos;re all set. Let&apos;s go…
      </p>
    </div>
  );
}
