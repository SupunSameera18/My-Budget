-- Migration 0006: transactions table + RLS + rpc_log_transaction
-- Architecture rules:
--   - RLS policy in the same migration as the table (no table ships RLS-disabled)
--   - amount_minor bigint (integer minor units, always positive; type encodes sign)
--   - RPC named rpc_<verb>_<noun>; security invoker so RLS applies inside
--   - No DELETE policy intentional — Story 3.3 adds delete + balance-recompute

-- ─────────────────────────────────────────────────────────────────────────────
-- Table
-- ─────────────────────────────────────────────────────────────────────────────
create table public.transactions (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id)        on delete cascade,
  account_id      uuid        not null references public.accounts(id),
  category_id     uuid        not null references public.categories(id),
  amount_minor    bigint      not null check (amount_minor > 0),
  date            date        not null default current_date,
  note            text,
  type            text        not null check (type in ('income', 'expense')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.transactions is
  'Per-user financial transactions. amount_minor is always positive; type (income/expense)
   determines the sign of the balance change on accounts.actual_balance_minor.
   is_shared column added in Story 7.1a (family layer).
   Edit/delete + Activity Trail added in Story 3.3.
   Splits added in Story 7.6.';

-- Fast per-user lookups (pickers, lists)
create index idx_transactions_user_id on public.transactions (user_id);

-- Date-range queries used by Breathing Room (1.11), Monthly Summary (6.2), etc.
create index idx_transactions_user_date on public.transactions (user_id, date);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.transactions enable row level security;

create policy transactions_select_owner
  on public.transactions
  for select
  using (auth.uid() = user_id);

create policy transactions_insert_owner
  on public.transactions
  for insert
  with check (auth.uid() = user_id);

create policy transactions_update_owner
  on public.transactions
  for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No DELETE policy: with RLS enabled and no delete policy, all DELETE attempts
-- (including by the owner) are denied by default. Story 3.3 adds delete with
-- balance-recompute logic.

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────
grant select, insert, update on public.transactions to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Keep updated_at current (reuses set_updated_at() from migration 0001)
-- ─────────────────────────────────────────────────────────────────────────────
create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute procedure public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_log_transaction
-- Atomically inserts a transaction AND updates accounts.actual_balance_minor.
-- Type is DERIVED from the category (not a caller param) — correct for single-user
-- mode; Story 7.5 adds is_shared to the call signature for family mode.
-- security invoker: RLS applies inside the function so only the owner's
-- categories and accounts are accessible — no service-role privilege escalation.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_log_transaction(
  p_account_id    uuid,
  p_category_id   uuid,
  p_amount_minor  bigint,
  p_date          date,
  p_note          text default null
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

  -- Derive transaction type from the category.
  -- Also validates category ownership + active status under RLS (security invoker).
  select type into v_cat_type
  from public.categories
  where id = p_category_id
    and user_id = v_user_id
    and archived_at is null;

  if v_cat_type is null then
    raise exception 'Category not found, not owned by this user, or archived';
  end if;

  -- Income adds to balance; expense subtracts.
  if v_cat_type = 'income' then
    v_delta := p_amount_minor;
  elsif v_cat_type = 'expense' then
    v_delta := -p_amount_minor;
  else
    raise exception 'Unexpected category type: %', v_cat_type;
  end if;

  -- Insert transaction row (RLS insert policy validates auth.uid() = user_id).
  insert into public.transactions (user_id, account_id, category_id, amount_minor, date, type, note)
  values (v_user_id, p_account_id, p_category_id, p_amount_minor, p_date, v_cat_type, p_note);

  -- Atomically update account balance.
  -- RLS update policy (security invoker) ensures this only succeeds for owner's account.
  -- archived_at IS NULL guard prevents balance mutation on soft-deleted accounts.
  update public.accounts
  set actual_balance_minor = actual_balance_minor + v_delta
  where id = p_account_id
    and user_id = v_user_id
    and archived_at is null;

  -- FOUND is true after UPDATE if at least one row was updated.
  -- If account is not found or RLS blocked the update, raise to roll back the whole txn.
  if not found then
    raise exception 'Account not found or not owned by this user';
  end if;
end;
$$;

grant execute on function public.rpc_log_transaction(uuid, uuid, bigint, date, text) to authenticated;
