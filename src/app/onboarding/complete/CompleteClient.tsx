"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { posthog } from "@/lib/analytics/posthog";

export function CompleteClient({ userId }: { userId: string }) {
  const router = useRouter();
  const firedRef = useRef(false);

  useEffect(() => {
    // Guard against double-fire from React StrictMode (effects run twice in dev)
    if (firedRef.current) return;
    firedRef.current = true;

    posthog.capture(
      "onboarding_completed",
      { user_id: userId, surface: "onboarding" },
      { send_instantly: true },
    );
    const t = setTimeout(() => router.replace("/dashboard"), 150);
    return () => clearTimeout(t);
  }, [router, userId]);

  return (
    <div className="flex min-h-dvh items-center justify-center p-8">
      <p className="text-sm text-ink-secondary">
        You&apos;re all set. Let&apos;s go…
      </p>
    </div>
  );
}
