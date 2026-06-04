-- Migration 0012: rpc_delete_category — hard-delete a category with no history
-- Note: DELETE was never granted on categories (only SELECT, INSERT, UPDATE in migration 0002).
-- This SECURITY DEFINER function is the ONLY hard-delete path for categories.
-- It runs as the function owner (postgres), bypassing the missing DELETE grant,
-- exactly like rpc_delete_account (migration 0009).

create or replace function public.rpc_delete_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Verify caller owns the category
  if not exists (
    select 1 from public.categories
    where id = p_category_id and user_id = auth.uid()
  ) then
    raise exception 'Category not found or not owned by caller';
  end if;

  -- Deny delete of non-archived categories (only archived categories may be hard-deleted)
  if not exists (
    select 1 from public.categories
    where id = p_category_id and archived_at is not null
  ) then
    raise exception 'Category must be archived before it can be deleted'
      using hint = 'ARCHIVE_BEFORE_DELETE';
  end if;

  -- Deny if any transactions reference this category
  if exists (
    select 1 from public.transactions where category_id = p_category_id limit 1
  ) then
    raise exception 'Category has transaction history — archive it instead of deleting'
      using hint = 'ARCHIVE_INSTEAD_OF_DELETE';
  end if;

  -- Hard delete (safe: caller verified, archived, no history)
  delete from public.categories where id = p_category_id and user_id = auth.uid();
end;
$$;

-- Only authenticated users may invoke this function
grant execute on function public.rpc_delete_category(uuid) to authenticated;
