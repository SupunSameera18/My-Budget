"use client";

import { useEffect } from "react";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { initPostHog, posthog } from "@/lib/analytics/posthog";

/**
 * Root-level PostHog provider. Initializes the client once on mount (no-op when
 * unconfigured) and exposes the PostHog context for future event/hook usage.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
