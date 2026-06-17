-- pgTAP test: accounts table structure and RLS enforcement (SELECT + INSERT + UPDATE)
begin;
select plan(12);

-- ── 1. Table exists ──────────────────────────────────────────────────────────
select has_table('public', 'accounts', 'accounts table exists in public schema');

-- ── 2. RLS is enabled ────────────────────────────────────────────────────────
select ok(
  (select relrowsecurity from pg_class
   where relname = 'accounts' and relnamespace = 'public'::regnamespace),
  'RLS is enabled on public.accounts'
);

-- ── 3. Owner SELECT policy exists ────────────────────────────────────────────
select ok(
  exists(
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'accounts'
      and cmd        = 'SELECT'
  ),
  'accounts has at least one SELECT policy'
);

-- ── Setup: insert two test auth users as postgres; seed an account for user1 ─
do $setup$
declare
  uid1 uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  uid2 uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
begin
  insert into auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values
    (uid1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'acct_user1@test.local', 'x', now(), now(), now(), '{}', '{}'),
    (uid2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'acct_user2@test.local', 'x', now(), now(), now(), '{}', '{}')
  on conflict (id) do nothing;

  insert into public.accounts (user_id, name, type, actual_balance_minor, currency)
  values
    (uid1, 'Main Bank', 'bank', 100000, 'USD'),
    (uid2, 'Savings',   'savings', 50000, 'USD')
  on conflict do nothing;
exception when others then
  raise exception 'pgTAP setup failed: %', sqlerrm;
end $setup$;

-- Simulate user 1 as the authenticated caller
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- ── 4. Owner can SELECT their own accounts ────────────────────────────────────
select ok(
  (select count(*) > 0 from public.accounts
   where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'owner (user1) can select their own accounts'
);

-- ── 5. Cross-user SELECT is blocked ──────────────────────────────────────────
select ok(
  (select count(*) = 0 from public.accounts
   where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  'user1 cannot select user2 accounts (SELECT RLS enforced)'
);

-- ── 6. Owner can INSERT an account for themselves ─────────────────────────────
with ins as (
  insert into public.accounts (user_id, name, type, actual_balance_minor, currency)
  values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Cash Wallet', 'cash', 0, 'USD')
  returning 1
)
select ok(count(*) = 1, 'owner (user1) can insert an account for themselves')
from ins;

-- ── 7. Cross-user INSERT is blocked ──────────────────────────────────────────
select throws_ok(
  $$ insert into public.accounts (user_id, name, type, actual_balance_minor, currency)
     values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Evil', 'cash', 0, 'USD') $$,
  '42501',
  NULL::text,
  'user1 cannot insert an account for user2 (INSERT RLS enforced)'
);

-- ── 8. Owner can UPDATE their own account ────────────────────────────────────
with upd as (
  update public.accounts
  set name = 'Updated Bank'
  where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    and name = 'Main Bank'
  returning 1
)
select ok(count(*) = 1, 'owner (user1) can update their own account')
from upd;

-- ── 9. Pre-condition: user2 has accounts (prevents vacuous pass in cross-user UPDATE) ─
set local role postgres;
select ok(
  (select count(*) > 0 from public.accounts
   where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  'user2 has accounts seeded (pre-condition for cross-user UPDATE test)'
);
set local role authenticated;

-- Note: cross-user UPDATE test verifies that UPDATE affects 0 rows (RLS blocks).
-- Combined with test 9 (pre-condition proves rows exist), a count of 0 is not vacuous.
with upd as (
  update public.accounts
  set name = 'Hacked'
  where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  returning 1
)
select ok(count(*) = 0, 'user1 cannot update user2 accounts (UPDATE RLS enforced)')
from upd;

-- ── 11. Pre-condition: user1 has accounts (anti-vacuous guard for DELETE test) ─
-- Switch to postgres so the privilege-revoked authenticated role does not block the count.
set local role postgres;
select ok(
  (select count(*) > 0 from public.accounts
   where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'user1 has accounts (pre-condition for DELETE privilege test)'
);
set local role authenticated;

-- ── 12. DELETE is forbidden — privilege revoked from authenticated role ──────
-- Migration 0008 revoked DELETE from anon/authenticated at the table-privilege level.
-- Accounts are soft-deleted via archived_at; hard-delete requires a security definer RPC.
-- [Task 9 — DELETE-blocked test, story 1-7]
select throws_ok(
  $$ delete from public.accounts
     where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' $$,
  '42501',
  NULL::text,
  'authenticated role cannot delete accounts (DELETE privilege revoked)'
);

select * from finish();
rollback;
