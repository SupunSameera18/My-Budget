# My Budget

A privacy-first couples' budgeting PWA — Next.js 16 (App Router) + Supabase, deployed on Vercel. This repo is the application; product/planning artifacts (PRD, architecture, epics) live in the parent `_bmad-output/` workspace.

## Stack

- **Next.js 16** (App Router, Turbopack) · **React 19.2** · **TypeScript**
- **Tailwind CSS 3** + **shadcn/ui**
- **Supabase** (Postgres + cookie-based SSR auth via `@supabase/ssr`)
- **PostHog** (product analytics — wired, events added later)
- **Testing:** Vitest + Testing Library (unit) · Playwright (E2E) · pgTAP (DB)

## Prerequisites

- **Node.js ≥ 20** (CI uses 22) and npm
- **Docker Desktop** (running) — required by the local Supabase stack
- **Supabase CLI** — `scoop install supabase` / `brew install supabase/tap/supabase`, or run via `npx supabase`

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Start the local Supabase stack (Postgres, Auth, Studio) — needs Docker running
supabase start

# 3. Create .env.local pointing at the local stack
supabase status -o env \
  --override-name api.url=NEXT_PUBLIC_SUPABASE_URL \
  --override-name auth.anon_key=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  > .env.local
# (optionally add NEXT_PUBLIC_POSTHOG_KEY / _HOST — see .env.example)

# 4. Run the app
npm run dev          # http://localhost:3000
```

`supabase stop` tears the stack down. After a schema change, regenerate DB types with
`supabase gen types typescript --local > src/types/database.types.ts` (no domain schema exists yet).

## Quality gates

Every gate below runs in CI (`.github/workflows/ci.yml`) on each pull request; a failing gate blocks merge. Run them locally with the same commands:

| Gate       | Command                | Notes                                               |
| ---------- | ---------------------- | --------------------------------------------------- |
| Type check | `npm run typecheck`    | `tsc --noEmit`                                      |
| Lint       | `npm run lint`         | ESLint (`next/core-web-vitals` + `next/typescript`) |
| Format     | `npm run format:check` | Prettier (`npm run format` to fix)                  |
| Unit       | `npm run test`         | Vitest (`npm run test:watch` for TDD)               |
| DB lint    | `npm run db:lint`      | `supabase db lint` — needs `supabase start`         |
| DB tests   | `npm run db:test`      | pgTAP in `supabase/tests/` — needs `supabase start` |
| E2E        | `npm run e2e`          | Playwright (`npx playwright install chromium` once) |

## Project structure

```
src/
  app/            # App Router routes, root layout (providers), auth + protected areas
  features/       # feature-first modules (transactions, budgets, …) — added per story
  components/     # ui/ (shadcn), providers/ (PostHog), shared UI
  lib/            # supabase/ (client/server/proxy), analytics/ (PostHog), utils
  server/         # server actions + RPC wrappers — added per story
  types/          # generated DB types + domain types — added per story
  proxy.ts        # @supabase/ssr session refresh + auth gating (Next 16 "proxy")
supabase/
  migrations/     # version-controlled SQL (RLS, RPC) — added from Story 1.4a
  functions/      # Edge Functions — added later
  tests/          # pgTAP DB tests
e2e/              # Playwright specs
```

## Deployment & ops (forward notes)

- **Hosting:** Vercel (Hobby/free); env vars set in the Vercel project (publishable key public; service-role + VAPID private).
- **Migrations:** applied on merge to `main` via `.github/workflows/deploy-migrations.yml` (gated off until the hosted Supabase project + secrets exist).
- **Idle-pause:** Supabase free tier pauses after ~7 days idle — a keep-alive ping is added in **Story 1.3** (not implemented here).
