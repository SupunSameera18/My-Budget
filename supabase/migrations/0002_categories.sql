-- Migration 0002: categories table + owner-only RLS + default category seed
-- Architecture rule: RLS policies created in the same migration as the table.

-- ─────────────────────────────────────────────────────────────────────────────
-- Table
-- ─────────────────────────────────────────────────────────────────────────────
create table public.categories (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  name        text        not null,
  type        text        not null check (type in ('income', 'expense')),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.categories is
  'Per-user income/expense categories. Soft-deleted via archived_at (Story 2.4 adds management UI).';

-- Index for fast per-user lookups (used by transaction logging pickers)
create index idx_categories_user_id on public.categories (user_id);

-- Unique constraint: prevents duplicate categories and makes seed_default_categories idempotent
create unique index idx_categories_user_name_type on public.categories (user_id, name, type);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.categories enable row level security;

create policy categories_select_owner
  on public.categories
  for select
  using (auth.uid() = user_id);

create policy categories_insert_owner
  on public.categories
  for insert
  with check (auth.uid() = user_id);

create policy categories_update_owner
  on public.categories
  for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No DELETE policy: categories are soft-deleted via archived_at, never hard-deleted
-- (hard delete only permitted when no history exists — handled in Story 2.4).

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────
grant select, insert, update on public.categories to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Keep updated_at current (reuses set_updated_at() from migration 0001)
-- ─────────────────────────────────────────────────────────────────────────────
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute procedure public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Default category seeding
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.seed_default_categories(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.categories (user_id, name, type)
  values
    -- Income
    (p_user_id, 'Salary',           'income'),
    (p_user_id, 'Freelance',        'income'),
    (p_user_id, 'Investment',       'income'),
    (p_user_id, 'Other Income',     'income'),
    -- Expense
    (p_user_id, 'Housing',          'expense'),
    (p_user_id, 'Groceries',        'expense'),
    (p_user_id, 'Dining Out',       'expense'),
    (p_user_id, 'Transport',        'expense'),
    (p_user_id, 'Utilities',        'expense'),
    (p_user_id, 'Healthcare',       'expense'),
    (p_user_id, 'Entertainment',    'expense'),
    (p_user_id, 'Shopping',         'expense'),
    (p_user_id, 'Education',        'expense'),
    (p_user_id, 'Other',            'expense')
  on conflict (user_id, name, type) do nothing;
end;
$$;

-- Restrict direct invocation: only the trigger path (handle_new_user_categories) should call
-- this function. Prevents any authenticated user from seeding categories into another account.
revoke execute on function public.seed_default_categories(uuid) from public;

-- Trigger: fires after every new auth user is created (separate from on_auth_user_created)
create or replace function public.handle_new_user_categories()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  begin
    perform public.seed_default_categories(new.id);
  exception when others then
    null; -- seeding failure must not block user creation
  end;
  return new;
end;
$$;

create trigger on_auth_user_categories_seed
  after insert on auth.users
  for each row execute procedure public.handle_new_user_categories();
