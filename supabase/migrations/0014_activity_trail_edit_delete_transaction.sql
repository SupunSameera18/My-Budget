-- Migration 0014: activity_trail table + soft-delete + edit/delete RPCs for transactions
-- Adds:
--   - transactions.archived_at (soft-delete column)
--   - activity_trail table with owner-only RLS
--   - rpc_edit_transaction  (security invoker, atomic balance recompute + trail write)
--   - rpc_delete_transaction (security invoker, soft-delete + balance reversal + trail write)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add archived_at to transactions (soft-delete)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.transactions
  add column archived_at timestamptz;

comment on column public.transactions.archived_at is
  'Soft-delete timestamp. NULL = active. When set, the transaction is treated as deleted
   but the row is retained for audit purposes. Set by rpc_delete_transaction.
   Migration 0008 revoked DELETE from authenticated — use this column, not DELETE.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. activity_trail table — append-only audit log
-- ─────────────────────────────────────────────────────────────────────────────
create table public.activity_trail (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  transaction_id  uuid        not null references public.transactions(id) on delete cascade,
  change_type     text        not null check (change_type in ('edit', 'delete')),
  changed_fields  jsonb       not null default '{}',
  created_at      timestamptz not null default now()
);

comment on table public.activity_trail is
  'Append-only audit log for transaction edits and soft-deletes.
   change_type = edit: changed_fields contains {field: {old, new}} for each mutated field.
   change_type = delete: changed_fields is {} (full row still queryable via archived_at IS NOT NULL).
   E7 Story 7.7 extends this with shared partner-visibility predicate.';

create index idx_activity_trail_transaction_id
  on public.activity_trail (transaction_id);

create index idx_activity_trail_user_id
  on public.activity_trail (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Row Level Security on activity_trail
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.activity_trail enable row level security;

create policy activity_trail_select_owner
  on public.activity_trail
  for select
  using (auth.uid() = user_id);

create policy activity_trail_insert_owner
  on public.activity_trail
  for insert
  with check (auth.uid() = user_id);

-- No UPDATE or DELETE policy — append-only table.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Grants
-- ─────────────────────────────────────────────────────────────────────────────
grant select, insert on public.activity_trail to authenticated;

revoke delete, truncate on public.activity_trail from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. rpc_edit_transaction
-- Atomically: loads old values, recomputes balance, updates transaction row,
-- writes activity_trail entry. Handles same-account (net delta) and
-- different-account (two separate UPDATEs) cases.
-- security invoker: RLS applies inside so only the owner's data is accessible.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_edit_transaction(
  p_transaction_id  uuid,
  p_account_id      uuid,
  p_category_id     uuid,
  p_amount_minor    bigint,
  p_date            date,
  p_note            text    default null,
  p_subcategory_id  uuid    default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_user_id          uuid;
  v_old_account_id   uuid;
  v_old_category_id  uuid;
  v_old_amount_minor bigint;
  v_old_date         date;
  v_old_note         text;
  v_old_subcategory_id uuid;
  v_old_cat_type     text;
  v_new_cat_type     text;
  v_reverse_delta    bigint;
  v_new_delta        bigint;
  v_changed_fields   jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount_minor <= 0 then
    raise exception 'amount_minor must be greater than 0, got %', p_amount_minor;
  end if;

  -- Load existing transaction values.
  -- Explicit user_id filter: defense-in-depth (§9); RLS also enforces ownership.
  -- archived_at IS NULL: prevent editing an already-deleted transaction.
  select account_id, category_id, amount_minor, date, note, subcategory_id
  into v_old_account_id, v_old_category_id, v_old_amount_minor, v_old_date, v_old_note, v_old_subcategory_id
  from public.transactions
  where id        = p_transaction_id
    and user_id   = v_user_id
    and archived_at is null;

  if not found then
    raise exception 'Transaction not found, not owned, or already deleted';
  end if;

  -- Derive old category type (for reverse delta).
  -- archived_at IS NULL: archived category returns NULL type → CASE silently treats income as expense,
  -- corrupting the balance. Guard the same way rpc_log_transaction guards the new-category lookup.
  select type into v_old_cat_type
  from public.categories
  where id          = v_old_category_id
    and user_id     = v_user_id
    and archived_at is null;

  if v_old_cat_type is null then
    raise exception 'Original category not found, not owned, or archived';
  end if;

  -- Derive new category type (validates ownership + active status).
  select type into v_new_cat_type
  from public.categories
  where id          = p_category_id
    and user_id     = v_user_id
    and archived_at is null;

  if v_new_cat_type is null then
    raise exception 'Category not found, not owned by this user, or archived';
  end if;

  -- Validate subcategory if provided: must belong to p_category_id, same user, not archived.
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

  -- Compute balance deltas.
  -- Reverse delta: undo the original balance contribution.
  v_reverse_delta := case when v_old_cat_type = 'income'
                          then -v_old_amount_minor
                          else  v_old_amount_minor end;

  -- New delta: apply the new balance contribution.
  v_new_delta := case when v_new_cat_type = 'income'
                      then  p_amount_minor
                      else -p_amount_minor end;

  -- Update account balances.
  if p_account_id = v_old_account_id then
    -- Same account: apply net delta in a single UPDATE.
    update public.accounts
    set actual_balance_minor = actual_balance_minor + v_reverse_delta + v_new_delta
    where id        = p_account_id
      and user_id   = v_user_id
      and archived_at is null;

    if not found then
      raise exception 'Account not found or not owned by this user';
    end if;
  else
    -- Different account: reverse on old account, apply on new account.
    update public.accounts
    set actual_balance_minor = actual_balance_minor + v_reverse_delta
    where id          = v_old_account_id
      and user_id     = v_user_id
      and archived_at is null;

    if not found then
      raise exception 'Original account not found, not owned, or archived';
    end if;

    update public.accounts
    set actual_balance_minor = actual_balance_minor + v_new_delta
    where id          = p_account_id
      and user_id     = v_user_id
      and archived_at is null;

    if not found then
      raise exception 'New account not found, not owned, or archived';
    end if;
  end if;

  -- Update the transaction row (type re-derived from new category).
  update public.transactions
  set account_id     = p_account_id,
      category_id    = p_category_id,
      amount_minor   = p_amount_minor,
      date           = p_date,
      note           = p_note,
      type           = v_new_cat_type,
      subcategory_id = p_subcategory_id,
      updated_at     = now()
  where id       = p_transaction_id
    and user_id  = v_user_id
    and archived_at is null;

  -- Build changed_fields jsonb — only include fields that actually changed.
  v_changed_fields := '{}'::jsonb;

  if v_old_amount_minor != p_amount_minor then
    v_changed_fields := v_changed_fields ||
      jsonb_build_object('amount_minor',
        jsonb_build_object('old', v_old_amount_minor, 'new', p_amount_minor));
  end if;

  if v_old_account_id != p_account_id then
    v_changed_fields := v_changed_fields ||
      jsonb_build_object('account_id',
        jsonb_build_object('old', v_old_account_id, 'new', p_account_id));
  end if;

  if v_old_category_id != p_category_id then
    v_changed_fields := v_changed_fields ||
      jsonb_build_object('category_id',
        jsonb_build_object('old', v_old_category_id, 'new', p_category_id));
  end if;

  if v_old_date != p_date then
    v_changed_fields := v_changed_fields ||
      jsonb_build_object('date',
        jsonb_build_object('old', v_old_date, 'new', p_date));
  end if;

  -- Note: compare with IS DISTINCT FROM to handle NULL correctly.
  if v_old_note is distinct from p_note then
    v_changed_fields := v_changed_fields ||
      jsonb_build_object('note',
        jsonb_build_object('old', v_old_note, 'new', p_note));
  end if;

  if v_old_subcategory_id is distinct from p_subcategory_id then
    v_changed_fields := v_changed_fields ||
      jsonb_build_object('subcategory_id',
        jsonb_build_object('old', v_old_subcategory_id, 'new', p_subcategory_id));
  end if;

  -- Write activity trail entry only when at least one field changed (AC3: edit entries must
  -- record actual changes; {} is reserved for delete entries).
  if v_changed_fields != '{}'::jsonb then
    insert into public.activity_trail (user_id, transaction_id, change_type, changed_fields)
    values (v_user_id, p_transaction_id, 'edit', v_changed_fields);
  end if;
end;
$$;

grant execute on function public.rpc_edit_transaction(uuid, uuid, uuid, bigint, date, text, uuid)
  to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. rpc_delete_transaction
-- Atomically: loads old values, reverses balance on the account, sets
-- archived_at = now() on the transaction, writes activity_trail entry.
-- security invoker: RLS (UPDATE policy) and explicit user_id filter enforce ownership.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_delete_transaction(
  p_transaction_id uuid
)
returns void
language plpgsql
security invoker
as $$
declare
  v_user_id      uuid;
  v_account_id   uuid;
  v_category_id  uuid;
  v_amount_minor bigint;
  v_cat_type     text;
  v_reverse_delta bigint;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Load transaction values.
  -- Explicit user_id + archived_at IS NULL: prevent double-deletion.
  select account_id, category_id, amount_minor
  into v_account_id, v_category_id, v_amount_minor
  from public.transactions
  where id          = p_transaction_id
    and user_id     = v_user_id
    and archived_at is null;

  if not found then
    raise exception 'Transaction not found, not owned, or already deleted';
  end if;

  -- Derive category type for balance reversal.
  -- archived_at IS NULL: archived category returns NULL type → CASE silently misclassifies,
  -- corrupting the balance reversal.
  select type into v_cat_type
  from public.categories
  where id          = v_category_id
    and user_id     = v_user_id
    and archived_at is null;

  if v_cat_type is null then
    raise exception 'Category not found, not owned, or archived';
  end if;

  -- Reverse delta: undo the original balance contribution.
  v_reverse_delta := case when v_cat_type = 'income'
                          then -v_amount_minor
                          else  v_amount_minor end;

  -- Reverse account balance.
  -- Explicit user_id + archived_at IS NULL (defense-in-depth; guard silent no-op on archived account).
  update public.accounts
  set actual_balance_minor = actual_balance_minor + v_reverse_delta
  where id          = v_account_id
    and user_id     = v_user_id
    and archived_at is null;

  if not found then
    raise exception 'Account not found, not owned, or archived';
  end if;

  -- Soft-delete the transaction (UPDATE using existing UPDATE grant; no DELETE needed).
  update public.transactions
  set archived_at = now(),
      updated_at  = now()
  where id       = p_transaction_id
    and user_id  = v_user_id
    and archived_at is null;

  -- Write activity trail entry (changed_fields = {} for delete).
  insert into public.activity_trail (user_id, transaction_id, change_type, changed_fields)
  values (v_user_id, p_transaction_id, 'delete', '{}'::jsonb);
end;
$$;

grant execute on function public.rpc_delete_transaction(uuid)
  to authenticated;
