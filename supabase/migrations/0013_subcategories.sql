-- Migration 0013: subcategories feature
-- Adds: profiles.subcategories_enabled, subcategories table + RLS,
--       transactions.subcategory_id, updated rpc_log_transaction, rpc_delete_subcategory

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. profiles.subcategories_enabled toggle column
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column subcategories_enabled boolean not null default false;

comment on column public.profiles.subcategories_enabled is
  'When true the log form shows a nested subcategory picker and the categories
   settings page shows subcategory management. Default false.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. subcategories table
-- ─────────────────────────────────────────────────────────────────────────────
create table public.subcategories (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id)        on delete cascade,
  category_id uuid        not null references public.categories(id) on delete cascade,
  name        text        not null,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.subcategories is
  'Optional one-level subcategories under a parent Category.
   Depth never exceeds two (category → subcategory). Soft-deleted via archived_at.
   Hard delete only when no transactions reference this subcategory.
   Enabled/disabled per user via profiles.subcategories_enabled.';

-- Unique name within a parent category per user (prevents "Electricity" twice under "Utilities")
create unique index idx_subcategories_user_cat_name
  on public.subcategories (user_id, category_id, name);

-- Fast per-user + per-parent lookups
create index idx_subcategories_category_id
  on public.subcategories (category_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Row Level Security on subcategories
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.subcategories enable row level security;

create policy subcategories_select_owner
  on public.subcategories
  for select
  using (auth.uid() = user_id);

create policy subcategories_insert_owner
  on public.subcategories
  for insert
  with check (auth.uid() = user_id);

create policy subcategories_update_owner
  on public.subcategories
  for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No DELETE policy: hard delete is via rpc_delete_subcategory (security definer)
-- which bypasses the missing grant exactly like rpc_delete_category (migration 0012).

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Grants
-- ─────────────────────────────────────────────────────────────────────────────
grant select, insert, update on public.subcategories to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Keep updated_at current (reuses set_updated_at() from migration 0001)
-- ─────────────────────────────────────────────────────────────────────────────
create trigger subcategories_set_updated_at
  before update on public.subcategories
  for each row execute procedure public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. rpc_delete_subcategory — same pattern as rpc_delete_category (migration 0012)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_delete_subcategory(p_subcategory_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Verify caller owns the subcategory
  if not exists (
    select 1 from public.subcategories
    where id = p_subcategory_id and user_id = auth.uid()
  ) then
    raise exception 'Subcategory not found or not owned by caller';
  end if;

  -- Deny if any transactions reference this subcategory
  if exists (
    select 1 from public.transactions
    where subcategory_id = p_subcategory_id limit 1
  ) then
    raise exception 'Subcategory has transaction history — archive it instead of deleting';
  end if;

  -- Hard delete (safe: caller verified, no history, defense-in-depth user_id re-check)
  delete from public.subcategories
  where id = p_subcategory_id and user_id = auth.uid();
end;
$$;

grant execute on function public.rpc_delete_subcategory(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Add subcategory_id nullable FK to transactions
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.transactions
  add column subcategory_id uuid references public.subcategories(id) on delete set null;

-- on delete set null: if a subcategory is hard-deleted, existing transactions lose
-- the reference gracefully (subcategory_id becomes null) rather than cascade-deleting
-- the transactions. Hard delete is only allowed when no transactions exist, so in
-- practice this FK action fires only in edge cases (e.g. test teardown).

comment on column public.transactions.subcategory_id is
  'Optional subcategory (one level under category_id). NULL when subcategories are
   not enabled or the user did not select one. Set to null on subcategory hard-delete.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Update rpc_log_transaction to accept optional p_subcategory_id
-- Existing 5-param signature is dropped; new 6-param signature replaces it.
-- The JS caller (Supabase RPC) uses named params — omitting p_subcategory_id
-- defaults to null, so existing TypeScript callers do not break.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.rpc_log_transaction(uuid, uuid, bigint, date, text);

create or replace function public.rpc_log_transaction(
  p_account_id     uuid,
  p_category_id    uuid,
  p_amount_minor   bigint,
  p_date           date,
  p_note           text default null,
  p_subcategory_id uuid default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_user_id   uuid;
  v_cat_type  text;
  v_delta     bigint;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount_minor <= 0 then
    raise exception 'amount_minor must be greater than 0, got %', p_amount_minor;
  end if;

  -- Derive type from category; validates ownership + active status under RLS.
  select type into v_cat_type
  from public.categories
  where id = p_category_id
    and user_id = v_user_id
    and archived_at is null;

  if v_cat_type is null then
    raise exception 'Category not found, not owned by this user, or archived';
  end if;

  -- Validate subcategory if provided: must belong to the given category, same user, not archived.
  if p_subcategory_id is not null then
    if not exists (
      select 1 from public.subcategories
      where id          = p_subcategory_id
        and category_id = p_category_id
        and user_id     = v_user_id
        and archived_at is null
    ) then
      raise exception 'Subcategory not found, not under this category, not owned, or archived';
    end if;
  end if;

  if v_cat_type = 'income' then
    v_delta := p_amount_minor;
  elsif v_cat_type = 'expense' then
    v_delta := -p_amount_minor;
  else
    raise exception 'Unexpected category type: %', v_cat_type;
  end if;

  -- Insert transaction (includes subcategory_id, which may be null).
  insert into public.transactions
    (user_id, account_id, category_id, subcategory_id, amount_minor, date, type, note)
  values
    (v_user_id, p_account_id, p_category_id, p_subcategory_id, p_amount_minor, p_date, v_cat_type, p_note);

  -- Atomically update account balance.
  update public.accounts
  set actual_balance_minor = actual_balance_minor + v_delta
  where id = p_account_id
    and user_id = v_user_id
    and archived_at is null;

  if not found then
    raise exception 'Account not found or not owned by this user';
  end if;
end;
$$;

grant execute on function public.rpc_log_transaction(uuid, uuid, bigint, date, text, uuid) to authenticated;
