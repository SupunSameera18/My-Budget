-- pgTAP test: transactions table structure and RLS enforcement (SELECT + INSERT + UPDATE + DELETE denied)
begin;
select plan(11);

-- ── 1. Table exists ──────────────────────────────────────────────────────────
select has_table('public', 'transactions', 'transactions table exists in public schema');

-- ── 2. RLS is enabled ────────────────────────────────────────────────────────
select ok(
  (select relrowsecurity from pg_class
   where relname = 'transactions' and relnamespace = 'public'::regnamespace),
  'RLS is enabled on public.transactions'
);

-- ── 3. Owner SELECT policy exists ────────────────────────────────────────────
select ok(
  exists(
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'transactions'
      and cmd        = 'SELECT'
  ),
  'transactions has at least one SELECT policy'
);

-- ── Setup: insert two test auth users as postgres; seed categories, accounts, and transactions ─
do $setup$
declare
  uid1 uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  uid2 uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  acc1 uuid := 'eeeeeeee-eeee-eeee-eeee-000000000001';
  acc2 uuid := 'ffffffff-ffff-ffff-ffff-000000000001';
  cat1 uuid := 'eeeeeeee-eeee-eeee-eeee-000000000002';
  cat2 uuid := 'ffffffff-ffff-ffff-ffff-000000000002';
begin
  insert into auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values
    (uid1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'txn_user1@test.local', 'x', now(), now(), now(), '{}', '{}'),
    (uid2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'txn_user2@test.local', 'x', now(), now(), now(), '{}', '{}')
  on conflict (id) do nothing;

  insert into public.accounts (id, user_id, name, type, actual_balance_minor, currency)
  values
    (acc1, uid1, 'TxnTest Bank 1', 'bank', 100000, 'USD'),
    (acc2, uid2, 'TxnTest Bank 2', 'bank', 50000, 'USD')
  on conflict do nothing;

  insert into public.categories (id, user_id, name, type)
  values
    (cat1, uid1, 'TxnTest Groceries 1', 'expense'),
    (cat2, uid2, 'TxnTest Groceries 2', 'expense')
  on conflict do nothing;

  insert into public.transactions (user_id, account_id, category_id, amount_minor, date, type)
  values
    (uid1, acc1, cat1, 5000, current_date, 'expense'),
    (uid2, acc2, cat2, 3000, current_date, 'expense')
  on conflict do nothing;
exception when others then
  raise exception 'pgTAP setup failed: %', sqlerrm;
end $setup$;

-- Simulate user 1 as the authenticated caller
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- ── 4. Owner can SELECT their own transactions ────────────────────────────────
select ok(
  (select count(*) > 0 from public.transactions
   where user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'owner (user1) can select their own transactions'
);

-- ── 5. Cross-user SELECT is blocked ──────────────────────────────────────────
select ok(
  (select count(*) = 0 from public.transactions
   where user_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
  'user1 cannot select user2 transactions (SELECT RLS enforced)'
);

-- ── 6. Owner can INSERT a transaction for themselves ──────────────────────────
with ins as (
  insert into public.transactions (user_id, account_id, category_id, amount_minor, date, type)
  values (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'eeeeeeee-eeee-eeee-eeee-000000000001',
    'eeeeeeee-eeee-eeee-eeee-000000000002',
    1000, current_date, 'expense'
  )
  returning 1
)
select ok(count(*) = 1, 'owner (user1) can insert a transaction for themselves')
from ins;

-- ── 7. Cross-user INSERT is blocked ──────────────────────────────────────────
select throws_ok(
  $$ insert into public.transactions (user_id, account_id, category_id, amount_minor, date, type)
     values (
       'ffffffff-ffff-ffff-ffff-ffffffffffff',
       'ffffffff-ffff-ffff-ffff-000000000001',
       'ffffffff-ffff-ffff-ffff-000000000002',
       1000, current_date, 'expense'
     ) $$,
  '42501',
  NULL::text,
  'user1 cannot insert a transaction for user2 (INSERT RLS enforced)'
);

-- ── 8. Owner can UPDATE their own transaction ─────────────────────────────────
with upd as (
  update public.transactions
  set note = 'Updated note'
  where user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
    and amount_minor = 5000
  returning 1
)
select ok(count(*) = 1, 'owner (user1) can update their own transaction')
from upd;

-- ── 9. Pre-condition: user2 has transactions (prevents vacuous pass in cross-user UPDATE) ─
set local role postgres;
select ok(
  (select count(*) > 0 from public.transactions
   where user_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
  'user2 has transactions seeded (pre-condition for cross-user UPDATE test)'
);
set local role authenticated;

-- Note: cross-user UPDATE test verifies that UPDATE affects 0 rows (RLS blocks).
-- Combined with test 9 (pre-condition proves rows exist), a count of 0 is not vacuous.
with upd as (
  update public.transactions
  set note = 'Hacked'
  where user_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
  returning 1
)
select ok(count(*) = 0, 'user1 cannot update user2 transactions (UPDATE RLS enforced)')
from upd;

-- ── 11. Owner DELETE is denied (no DELETE policy — default deny with RLS enabled) ─
select throws_ok(
  $$ delete from public.transactions
     where user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' $$,
  '42501',
  NULL::text,
  'owner cannot delete their own transactions (no DELETE policy — RLS default deny)'
);

select * from finish();
rollback;
