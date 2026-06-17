/**
 * Server-only PostHog API key for direct `fetch` capture calls from server
 * actions (as opposed to `posthog-js` client init, which legitimately needs
 * the NEXT_PUBLIC_-prefixed variable since it must reach the browser bundle).
 *
 * Server actions previously read `NEXT_PUBLIC_POSTHOG_KEY` directly — that
 * variable is intentionally inlined into the client bundle by Next.js, so
 * reusing it server-side works but blurs the client/server boundary (Phase 2
 * gap analysis, 7-2). `POSTHOG_KEY` (no NEXT_PUBLIC_ prefix) is the
 * server-only equivalent; falls back to the public key so existing
 * deployments that haven't set the new var yet keep working unchanged.
 */
export function getServerPostHogKey(): string | undefined {
  return process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY;
}
