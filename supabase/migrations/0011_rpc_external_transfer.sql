-- Migration 0011: rpc_external_transfer
-- Adds the external-transfer RPC. No table changes — transfers table from 0010 is already
-- forward-compatible (type='external', exactly one of from/to_account_id non-null).

create or replace function public.rpc_external_transfer(
  p_account_id   uuid,
  p_direction    text,   -- 'in' | 'out'
  p_amount_minor bigint,
  p_date         date,
  p_note         text    default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_user_id  uuid;
  v_rowcount integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount_minor <= 0 then
    raise exception 'amount_minor must be greater than 0, got %', p_amount_minor;
  end if;

  if p_direction not in ('in', 'out') then
    raise exception 'direction must be ''in'' or ''out'', got %', p_direction;
  end if;

  -- Verify account is owned and active
  perform 1 from public.accounts
  where id = p_account_id
    and user_id = v_user_id
    and archived_at is null;
  if not found then
    raise exception 'Account not found, not owned by caller, or archived';
  end if;

  if p_direction = 'in' then
    update public.accounts
    set actual_balance_minor = actual_balance_minor + p_amount_minor
    where id = p_account_id and user_id = v_user_id and archived_at is null;
    get diagnostics v_rowcount = row_count;
    if v_rowcount = 0 then
      raise exception 'Account update failed — account may have been archived or deleted concurrently';
    end if;

    insert into public.transfers (user_id, type, from_account_id, to_account_id, amount_minor, date, note)
    values (v_user_id, 'external', null, p_account_id, p_amount_minor, p_date, p_note);

  else -- 'out'
    update public.accounts
    set actual_balance_minor = actual_balance_minor - p_amount_minor
    where id = p_account_id and user_id = v_user_id and archived_at is null;
    get diagnostics v_rowcount = row_count;
    if v_rowcount = 0 then
      raise exception 'Account update failed — account may have been archived or deleted concurrently';
    end if;

    insert into public.transfers (user_id, type, from_account_id, to_account_id, amount_minor, date, note)
    values (v_user_id, 'external', p_account_id, null, p_amount_minor, p_date, p_note);
  end if;
end;
$$;

grant execute on function public.rpc_external_transfer(uuid, text, bigint, date, text) to authenticated;
