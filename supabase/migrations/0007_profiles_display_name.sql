-- Migration 0007: add display_name + expand onboarding step range to 5
-- Inserting a "name" step as the new step 1; existing steps shift by 1.
-- Completed users are unaffected — (app)/layout.tsx gates on onboarding_completed_at, not step.

-- ─────────────────────────────────────────────────────────────────────────────
-- display_name column
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column display_name text;

-- NULL allowed for grandfathered accounts that pre-date this column.
alter table public.profiles
  add constraint profiles_display_name_length
  check (display_name is null or char_length(display_name) <= 50);

comment on column public.profiles.display_name is
  'Friendly name entered at onboarding step 1. NULL for accounts that pre-date
   this column. Used for dashboard greetings ("Hi Supun!").';

-- ─────────────────────────────────────────────────────────────────────────────
-- Expand onboarding step range 1-4 → 1-5
-- Step map after this migration:
--   1 = name  2 = currency  3 = account  4 = categories  5 = complete
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  drop constraint profiles_onboarding_step_range;

alter table public.profiles
  add constraint profiles_onboarding_step_range
  check (onboarding_step between 1 and 5);

comment on column public.profiles.onboarding_step is
  '1=name, 2=currency, 3=account, 4=categories, 5=complete.
   Default 1 for new profiles (trigger path). Used to resume mid-flow abandonment.';
