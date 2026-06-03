-- Migration 0005: add checklist_completed_at to profiles
-- Architecture rule: no new table → no new RLS policy needed.
-- The existing profiles_update_owner policy (migration 0001) already covers
-- all profile columns, including this addition.

alter table public.profiles
  add column checklist_completed_at timestamptz;

comment on column public.profiles.checklist_completed_at is
  'Set exactly once when the user completes all first-run checklist items.
   NULL = checklist visible on dashboard. Set server-side by markChecklistComplete()
   server action. Individual item completion wired in Stories 1.10, 4.x, 7.x.';

-- Grandfather existing profiles (dev/CI users who pre-date the checklist)
-- so they do NOT see the checklist on next sign-in.
update public.profiles
set checklist_completed_at = now()
where onboarding_completed_at is not null;
