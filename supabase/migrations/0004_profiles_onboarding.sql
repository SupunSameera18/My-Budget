-- Migration 0004: add currency + onboarding tracking columns to profiles
-- Architecture rule: no new table → no new RLS policy needed.
-- The existing profiles_update_owner policy (migration 0001) already covers
-- all profile columns, including these additions.
-- set_updated_at() trigger from 0001 keeps updated_at current automatically.

-- ─────────────────────────────────────────────────────────────────────────────
-- Add onboarding columns
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column currency               text        not null default 'USD',
  add column onboarding_step        smallint    not null default 1,
  add column onboarding_completed_at timestamptz;

-- ISO 4217 format guard: 3 uppercase letters
alter table public.profiles
  add constraint profiles_currency_format
  check (currency ~ '^[A-Z]{3}$');

-- Step range guard: only valid step values (1=currency, 2=account, 3=categories, 4=complete)
alter table public.profiles
  add constraint profiles_onboarding_step_range
  check (onboarding_step between 1 and 4);

-- Note: Supabase CLI wraps each migration in a transaction automatically.
-- All DDL + DML below runs atomically; partial failure rolls back entirely.

comment on column public.profiles.currency is
  'ISO 4217 code chosen at onboarding step 1. Applied app-wide. Lockable after
   first Transaction (enforced in Story 1.10 via rpc_log_transaction). Default
   ''USD'' until the user selects their currency.';

comment on column public.profiles.onboarding_step is
  '1 = on currency step, 2 = on account step, 3 = on categories step,
   4 = onboarding complete. Default 1 for new profiles (trigger path).
   Used to resume a mid-flow abandonment.';

comment on column public.profiles.onboarding_completed_at is
  'Set exactly once when the user completes step 3 → complete page.
   NULL = onboarding in progress. (app)/layout.tsx redirects to /onboarding
   while this is NULL.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Grandfather existing profiles (dev / CI users who pre-date onboarding)
-- so they are NOT redirected to /onboarding on next sign-in.
-- ─────────────────────────────────────────────────────────────────────────────
update public.profiles
set
  onboarding_completed_at = now(),
  onboarding_step         = 4
where onboarding_completed_at is null;
