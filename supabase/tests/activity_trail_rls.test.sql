-- pgTAP test: activity_trail table structure and RLS enforcement
-- Uses fresh UUIDs (11111111-* and 22222222-*) to avoid collisions with other test files.
begin;
select plan(10);

-- ── 1. activity_trail table exists ───────────────────────────────────────────
select has_table('public', 'activity_trail', 'activity_trail table exists in public schema');

-- ── 2. RLS is enabled ────────────────────────────────────────────────────────
select ok(
  (select relrowsecurity from pg_class
   where relname = 'activity_trail' and relnamespace = 'public'::regnamespace),
  'RLS is enabled on public.activity_trail'
);

-- ── 3. SELECT policy exists ──────────────────────────────────────────────────
select ok(
  exists(
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'activity_trail'
      and cmd        = 'SELECT'
  ),
  'activity_trail has at least one SELECT policy'
);

-- ── Setup: insert two test auth users, accounts, categories, transactions, trail entries ─
do $setup$
declare
  uid1  uuid := '11111111-1111-4111-8111-111111111111';
  uid2  uuid := '22222222-2222-4222-8222-222222222222';
  acc1  uuid := '11111111-1111-4111-8111-000000000001';
  acc2  uuid := '22222222-2222-4222-8222-000000000001';
  cat1  uuid := '11111111-1111-4111-8111-000000000002';
  cat2  uuid := '22222222-2222-4222-8222-000000000002';
  txn1  uuid := '11111111-1111-4111-8111-000000000003';
  txn2  uuid := '22222222-2222-4222-8222-000000000003';
begin
  insert into auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values
    (uid1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'trail_user1@test.local', 'x', now(), now(), now(), '{}', '{}'),
    (uid2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'trail_user2@test.local', 'x', now(), now(), now(), '{}', '{}')
  on conflict (id) do nothing;

  insert into public.accounts (id, user_id, name, type, actual_balance_minor, currency)
  values
    (acc1, uid1, 'Trail Test Bank 1', 'bank', 100000, 'USD'),
    (acc2, uid2, 'Trail Test Bank 2', 'bank', 50000,  'USD')
  on conflict do nothing;

  insert into public.categories (id, user_id, name, type)
  values
    (cat1, uid1, 'Trail Test Groceries 1', 'expense'),
    (cat2, uid2, 'Trail Test Groceries 2', 'expense')
  on conflict do nothing;

  insert into public.transactions (id, user_id, account_id, category_id, amount_minor, date, type)
  values
    (txn1, uid1, acc1, cat1, 4000, current_date, 'expense'),
    (txn2, uid2, acc2, cat2, 2000, current_date, 'expense')
  on conflict do nothing;

  -- Seed one trail entry for each user
  insert into public.activity_trail (user_id, transaction_id, change_type, changed_fields)
  values
    (uid1, txn1, 'edit', '{"amount_minor": {"old": 3000, "new": 4000}}'::jsonb),
    (uid2, txn2, 'edit', '{"amount_minor": {"old": 1000, "new": 2000}}'::jsonb)
  on conflict do nothing;
exception when others then
  raise exception 'pgTAP setup failed: %', sqlerrm;
end $setup$;

-- Simulate user 1 as the authenticated caller
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- ── 4. Owner can SELECT their own trail entries ───────────────────────────────
select ok(
  (select count(*) > 0 from public.activity_trail
   where user_id = '11111111-1111-4111-8111-111111111111'),
  'owner (user1) can select their own activity trail entries'
);

-- ── 5. Pre-condition: user2 has trail entries (anti-vacuous guard) ────────────
set local role postgres;
select ok(
  (select count(*) > 0 from public.activity_trail
   where user_id = '22222222-2222-4222-8222-222222222222'),
  'user2 has activity trail entries seeded (pre-condition for cross-user SELECT test)'
);
set local role authenticated;

-- ── 6. Cross-user SELECT is blocked ──────────────────────────────────────────
select ok(
  (select count(*) = 0 from public.activity_trail
   where user_id = '22222222-2222-4222-8222-222222222222'),
  'user1 cannot select user2 activity trail entries (SELECT RLS enforced)'
);

-- ── 7. Owner can INSERT a trail entry for their own transaction ───────────────
with ins as (
  insert into public.activity_trail (user_id, transaction_id, change_type, changed_fields)
  values (
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-000000000003',
    'delete',
    '{}'::jsonb
  )
  returning 1
)
select ok(count(*) = 1, 'owner (user1) can insert an activity trail entry for their own transaction')
from ins;

-- ── 8. Cross-user INSERT is blocked (42501 — no INSERT grant for wrong user_id) ─
select throws_ok(
  $$ insert into public.activity_trail (user_id, transaction_id, change_type, changed_fields)
     values (
       '22222222-2222-4222-8222-222222222222',
       '22222222-2222-4222-8222-000000000003',
       'edit',
       '{}'::jsonb
     ) $$,
  '42501',
  NULL::text,
  'user1 cannot insert an activity trail entry for user2 (INSERT RLS enforced)'
);

-- ── 9. archived_at column exists on transactions ──────────────────────────────
-- Switch to postgres for schema check (metadata is not RLS-gated)
set local role postgres;
select ok(
  exists(
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'transactions'
      and column_name  = 'archived_at'
  ),
  'transactions.archived_at column exists (soft-delete added in migration 0014)'
);

-- ── 10. change_type check constraint enforces allowed values ──────────────────
select throws_ok(
  $$ insert into public.activity_trail (user_id, transaction_id, change_type, changed_fields)
     values (
       '11111111-1111-4111-8111-111111111111',
       '11111111-1111-4111-8111-000000000003',
       'invalid_type',
       '{}'::jsonb
     ) $$,
  '23514',
  NULL::text,
  'activity_trail change_type check constraint rejects invalid values'
);

select * from finish();
rollback;
