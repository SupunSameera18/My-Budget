-- pgTAP test: categories table structure and RLS enforcement (SELECT + INSERT + UPDATE)
begin;
select plan(10);

-- ── 1. Table exists ──────────────────────────────────────────────────────────
select has_table('public', 'categories', 'categories table exists in public schema');

-- ── 2. RLS is enabled ────────────────────────────────────────────────────────
select ok(
  (select relrowsecurity from pg_class
   where relname = 'categories' and relnamespace = 'public'::regnamespace),
  'RLS is enabled on public.categories'
);

-- ── 3. Owner SELECT policy exists ────────────────────────────────────────────
select ok(
  exists(
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'categories'
      and cmd        = 'SELECT'
  ),
  'categories has at least one SELECT policy'
);

-- ── Setup: insert two test auth users as postgres; seed categories for user1 ──
do $setup$
declare
  uid1 uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  uid2 uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
begin
  insert into auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values
    (uid1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'cat_user1@test.local', 'x', now(), now(), now(), '{}', '{}'),
    (uid2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'cat_user2@test.local', 'x', now(), now(), now(), '{}', '{}')
  on conflict (id) do nothing;

  -- Note: inserting into auth.users above fires on_auth_user_categories_seed, which seeds all 14
  -- default categories for both uid1 and uid2. The inserts below are intentionally redundant;
  -- on conflict (user_id, name, type) do nothing ensures no duplicates with the unique index.
  insert into public.categories (user_id, name, type)
  values
    (uid1, 'Salary',    'income'),
    (uid1, 'Groceries', 'expense')
  on conflict (user_id, name, type) do nothing;
exception when others then
  raise exception 'pgTAP setup failed: %', sqlerrm;
end $setup$;

-- Simulate user 1 as the authenticated caller
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- ── 4. Owner can SELECT their own categories ──────────────────────────────────
select ok(
  (select count(*) > 0 from public.categories
   where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'owner (user1) can select their own categories'
);

-- ── 5. Cross-user SELECT is blocked ──────────────────────────────────────────
select ok(
  (select count(*) = 0 from public.categories
   where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'user1 cannot select user2 categories (SELECT RLS enforced)'
);

-- ── 6. Owner can INSERT a category for themselves ─────────────────────────────
-- auth.uid() = uid1, inserting with user_id = uid1 → should succeed
with ins as (
  insert into public.categories (user_id, name, type)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Income', 'income')
  returning 1
)
select ok(count(*) = 1, 'owner (user1) can insert a category for themselves')
from ins;

-- ── 7. Cross-user INSERT is blocked ──────────────────────────────────────────
-- auth.uid() = uid1, trying to insert with user_id = uid2 → WITH CHECK fails
select throws_ok(
  $$ insert into public.categories (user_id, name, type)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Evil', 'expense') $$,
  '42501',
  NULL::text,
  'user1 cannot insert a category for user2 (INSERT RLS enforced)'
);

-- ── 8. Owner can UPDATE their own category ───────────────────────────────────
with upd as (
  update public.categories
  set name = 'Updated Salary'
  where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    and name = 'Salary'
  returning 1
)
select ok(count(*) = 1, 'owner (user1) can update their own category')
from upd;

-- ── 9. Pre-condition: user2 has categories (prevents vacuous pass in test 10) ─
set local role postgres;
select ok(
  (select count(*) > 0 from public.categories
   where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'user2 has categories seeded (pre-condition for cross-user UPDATE test)'
);
set local role authenticated;

-- ── 10. Cross-user UPDATE is blocked ─────────────────────────────────────────
with upd as (
  update public.categories
  set name = 'Hacked'
  where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  returning 1
)
select ok(count(*) = 0, 'user1 cannot update user2 categories (UPDATE RLS enforced)')
from upd;

select * from finish();
rollback;
