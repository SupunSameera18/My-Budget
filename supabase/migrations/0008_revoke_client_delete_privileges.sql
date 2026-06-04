-- Migration 0008: defense-in-depth — revoke DELETE and TRUNCATE from client roles
--
-- Supabase's default ACL grants ALL privileges (incl. DELETE, TRUNCATE) to the
-- anon and authenticated roles on every new public table via ALTER DEFAULT PRIVILEGES.
-- Our RLS policies block unwanted deletes by silently filtering to 0 rows, but
-- revoking the privilege at the table level provides a second layer: any future
-- RLS policy mistake cannot accidentally open a client-delete path.
--
-- Tables excluded: none of these tables should ever allow client-initiated hard-deletes.
-- Soft-delete (archived_at) is the only deletion pattern in v1.
-- Story 3.3 will add a real soft-delete RLS policy for transactions; when that arrives,
-- it should use UPDATE (set archived_at), not DELETE.

revoke delete, truncate on public.profiles    from anon, authenticated;
revoke delete, truncate on public.accounts    from anon, authenticated;
revoke delete, truncate on public.categories  from anon, authenticated;
revoke delete, truncate on public.transactions from anon, authenticated;
