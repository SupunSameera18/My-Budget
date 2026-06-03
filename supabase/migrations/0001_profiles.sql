-- Migration 0001: profiles table + owner-only RLS + auto-create trigger
-- No table ships without an RLS policy in the same migration (architecture rule).

-- ────────────────────────────────────────────────────────────────────────────
-- Table
-- ────────────────────────────────────────────────────────────────────────────
create table public.profiles (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth user. Extended by later stories (currency, onboarding, checklist).';

-- ────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ────────────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- Owner can read their own profile
create policy profiles_select_owner
  on public.profiles
  for select
  using (auth.uid() = user_id);

-- Owner can insert their own profile (used if called outside trigger path)
create policy profiles_insert_owner
  on public.profiles
  for insert
  with check (auth.uid() = user_id);

-- Owner can update their own profile
create policy profiles_update_owner
  on public.profiles
  for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No DELETE policy: profiles are cascade-deleted when auth.users row is removed.

-- ────────────────────────────────────────────────────────────────────────────
-- Grants
-- ────────────────────────────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Auto-create trigger (covers email/password AND Google OAuth sign-up paths)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ────────────────────────────────────────────────────────────────────────────
-- Keep updated_at current on every row update
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();
