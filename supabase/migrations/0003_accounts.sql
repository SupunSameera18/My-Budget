-- Migration 0003: accounts table + owner-only RLS
-- Architecture rule: RLS policies created in the same migration as the table.
-- Architecture rule: actual_balance_minor uses bigint (integer minor units — no float drift).
-- Note: currency defaults to 'USD'; Story 1.8 will read currency from profiles when it adds
-- that column. Do NOT add profile.currency logic here.

-- ─────────────────────────────────────────────────────────────────────────────
-- Table
-- ─────────────────────────────────────────────────────────────────────────────
create table public.accounts (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references auth.users(id) on delete cascade,
  name                 text        not null,
  type                 text        not null check (type in ('cash', 'bank', 'savings')),
  actual_balance_minor bigint      not null default 0,
  currency             text        not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.accounts is
  'Per-user money accounts (Cash/Bank/Savings). actual_balance_minor recomputed by RPC on each
   transaction write (Story 1.10+). archived_at for soft-delete (Story 2.1 adds management UI).
   currency retained per-account for future multi-currency; single-currency in v1.';

-- Index for fast per-user lookups (used by transaction logging pickers, balance reads)
create index idx_accounts_user_id on public.accounts (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.accounts enable row level security;

create policy accounts_select_owner
  on public.accounts
  for select
  using (auth.uid() = user_id);

create policy accounts_insert_owner
  on public.accounts
  for insert
  with check (auth.uid() = user_id);

create policy accounts_update_owner
  on public.accounts
  for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Soft-delete architecture: accounts are NEVER hard-deleted — use archived_at instead.
-- No DELETE policy is intentional: with RLS enabled and no delete policy, all DELETE
-- attempts (including owner) are denied by default. Story 2.1 adds archive/unarchive UI.

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────
grant select, insert, update on public.accounts to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Keep updated_at current (reuses set_updated_at() from migration 0001)
-- ─────────────────────────────────────────────────────────────────────────────
create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute procedure public.set_updated_at();
