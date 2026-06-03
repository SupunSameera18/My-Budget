import { redirect } from "next/navigation";

// The root path funnels straight into the app. All gating lives downstream:
// the (app) route group's middleware redirects unauthenticated visitors to
// /auth/login, and (app)/layout.tsx redirects un-onboarded users to /onboarding.
// Routing through /dashboard reuses those existing, tested guards rather than
// duplicating auth/onboarding checks here.
export default function Home() {
  redirect("/dashboard");
}
