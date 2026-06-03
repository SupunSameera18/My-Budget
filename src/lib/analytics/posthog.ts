"use client";

import posthog from "posthog-js";

let initialized = false;

/**
 * Initialize PostHog on the client exactly once.
 *
 * Defensive by design: when NEXT_PUBLIC_POSTHOG_KEY is absent (local dev / CI),
 * this is a no-op and never throws — the app boots regardless. No events are
 * captured here; event instrumentation lands in a later story.
 */
export function initPostHog(): void {
  if (initialized || typeof window === "undefined") return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  posthog.init(key, {
    api_host:
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    capture_pageview: false,
    capture_pageleave: false,
  });
  initialized = true;
}

export { posthog };
