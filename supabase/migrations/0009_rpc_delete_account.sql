-- Migration 0009: rpc_delete_account — hard-delete an empty account
--
-- Context: migration 0008 revokes DELETE privilege from anon + authenticated on accounts,
-- making all client-initiated DELETEs impossible (even with a DELETE RLS policy).
-- This SECURITY DEFINER function is the ONLY valid hard-delete path for accounts in v1.
-- It runs as the function owner (postgres), bypassing the revoked grant, while still
-- verifying ownership and history via application logic.
--
-- Usage: called by deleteAccount() server action in Story 2.1.
-- Story scope: hard delete is only offered in the UI when the account has no Transactions.

create or replace function rpc_delete_account(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Verify caller owns the account
  if not exists (
    select 1 from public.accounts
    where id = p_account_id and user_id = auth.uid()
  ) then
    raise exception 'Account not found or not owned by caller';
  end if;

  -- Deny if any transactions reference this account
  if exists (
    select 1 from public.transactions where account_id = p_account_id limit 1
  ) then
    raise exception 'Account has transaction history — archive it instead of deleting';
  end if;

  -- Hard delete (safe: caller verified, no history exists)
  delete from public.accounts where id = p_account_id;
end;
$$;

-- Only authenticated users may invoke this function
grant execute on function rpc_delete_account(uuid) to authenticated;
