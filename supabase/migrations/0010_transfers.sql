-- Migration 0010: transfers table + owner-only RLS + rpc_internal_transfer
-- Handles internal (Story 2.2) and external (Story 2.3) transfers.
-- Architecture: transfers are NEVER Income/Expense — stored here, not in transactions.
-- Breathing Room/Budgets query transactions only — automatic exclusion, no guard needed.

create table public.transfers (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  type             text        not null check (type in ('internal', 'external')),
  from_account_id  uuid        references public.accounts(id),
  to_account_id    uuid        references public.accounts(id),
  amount_minor     bigint      not null check (amount_minor > 0),
  date             date        not null default current_date,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint transfers_accounts_check check (
    (type = 'internal'
     AND from_account_id IS NOT NULL
     AND to_account_id   IS NOT NULL
     AND from_account_id <> to_account_id)
    OR
    (type = 'external'
     AND num_nonnulls(from_account_id, to_account_id) = 1)
  )
);

comment on table public.transfers is
  'Internal and external transfers. Never creates transactions rows.
   Internal: source actual_balance_minor−, destination+, net worth unchanged.
   External: one-sided balance adjustment (Story 2.3).
   from_account_id/to_account_id nullable by design for external type.';

create index idx_transfers_user_id on public.transfers (user_id);

alter table public.transfers enable row level security;

create policy transfers_select_owner
  on public.transfers for select
  using (auth.uid() = user_id);

create policy transfers_insert_owner
  on public.transfers for insert
  with check (auth.uid() = user_id);

-- No DELETE policy intentional — history preserved, mirrors accounts/transactions pattern.

grant select, insert on public.transfers to authenticated;

-- Defense-in-depth: matches migration 0008 pattern
revoke delete, truncate on public.transfers from anon, authenticated;

create trigger transfers_set_updated_at
  before update on public.transfers
  for each row execute procedure public.set_updated_at();

-- rpc_internal_transfer
-- security invoker: RLS applies inside — ownership checks via user_id filter are
-- still included explicitly as defensive guards before the UPDATEs.
create or replace function public.rpc_internal_transfer(
  p_from_account_id uuid,
  p_to_account_id   uuid,
  p_amount_minor    bigint,
  p_date            date,
  p_note            text default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_user_id uuid;
  v_rowcount integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount_minor <= 0 then
    raise exception 'amount_minor must be greater than 0, got %', p_amount_minor;
  end if;

  if p_from_account_id = p_to_account_id then
    raise exception 'Source and destination accounts must be different';
  end if;

  -- Verify source is owned and active
  perform 1 from public.accounts
  where id = p_from_account_id
    and user_id = v_user_id
    and archived_at is null;
  if not found then
    raise exception 'Source account not found, not owned by caller, or archived';
  end if;

  -- Verify destination is owned and active
  perform 1 from public.accounts
  where id = p_to_account_id
    and user_id = v_user_id
    and archived_at is null;
  if not found then
    raise exception 'Destination account not found, not owned by caller, or archived';
  end if;

  -- Decrease source
  update public.accounts
  set actual_balance_minor = actual_balance_minor - p_amount_minor
  where id = p_from_account_id and user_id = v_user_id;
  get diagnostics v_rowcount = row_count;
  if v_rowcount = 0 then
    raise exception 'Source account update failed — account may have been deleted concurrently';
  end if;

  -- Increase destination
  update public.accounts
  set actual_balance_minor = actual_balance_minor + p_amount_minor
  where id = p_to_account_id and user_id = v_user_id;
  get diagnostics v_rowcount = row_count;
  if v_rowcount = 0 then
    raise exception 'Destination account update failed — account may have been deleted concurrently';
  end if;

  -- Record the transfer
  insert into public.transfers (user_id, type, from_account_id, to_account_id, amount_minor, date, note)
  values (v_user_id, 'internal', p_from_account_id, p_to_account_id, p_amount_minor, p_date, p_note);
end;
$$;

grant execute on function public.rpc_internal_transfer(uuid, uuid, bigint, date, text) to authenticated;
