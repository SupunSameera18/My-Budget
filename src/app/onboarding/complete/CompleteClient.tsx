"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { posthog } from "@/lib/analytics/posthog";

export function CompleteClient({ userId }: { userId: string }) {
  const router = useRouter();

  useEffect(() => {
    posthog.capture("onboarding_completed", {
      user_id: userId,
      surface: "onboarding",
    });
    // 150ms gives PostHog time to queue the event before navigation
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
