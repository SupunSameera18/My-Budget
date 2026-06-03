-- pgTAP test: profiles table structure and RLS enforcement (SELECT + INSERT + UPDATE)
begin;
select plan(8);

-- ── 1. Table exists ──────────────────────────────────────────────────────────
select has_table('public', 'profiles', 'profiles table exists in public schema');

-- ── 2. RLS is enabled ────────────────────────────────────────────────────────
select ok(
  (select relrowsecurity from pg_class
   where relname = 'profiles' and relnamespace = 'public'::regnamespace),
  'RLS is enabled on public.profiles'
);

-- ── 3. Owner SELECT policy exists ────────────────────────────────────────────
select ok(
  exists(
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'profiles'
      and cmd        = 'SELECT'
  ),
  'profiles has at least one SELECT policy'
);

-- ── Setup: insert three test auth users as postgres; only uid1/uid2 get profiles ──
-- uid3 exists in auth.users but has no profile (used for INSERT RLS test).
do $setup$
declare
  uid1 uuid := '11111111-1111-1111-1111-111111111111';
  uid2 uuid := '22222222-2222-2222-2222-222222222222';
  uid3 uuid := '33333333-3333-3333-3333-333333333333';
begin
  insert into auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values
    (uid1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'user1@test.local', 'x', now(), now(), now(), '{}', '{}'),
    (uid2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'user2@test.local', 'x', now(), now(), now(), '{}', '{}'),
    (uid3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'user3@test.local', 'x', now(), now(), now(), '{}', '{}')
  on conflict (id) do nothing;

  insert into public.profiles (user_id) values (uid1), (uid2)
  on conflict (user_id) do nothing;
exception when others then
  raise exception 'pgTAP setup failed: %', sqlerrm;
end $setup$;

-- Simulate user 1 as the authenticated caller
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- ── 4. Owner can read their own profile ──────────────────────────────────────
select ok(
  (select count(*) = 1 from public.profiles
   where user_id = '11111111-1111-1111-1111-111111111111'),
  'owner (user1) can select their own profile'
);

-- ── 5. Cross-user SELECT is blocked ──────────────────────────────────────────
select ok(
  (select count(*) = 0 from public.profiles
   where user_id = '22222222-2222-2222-2222-222222222222'),
  'user1 cannot select user2 profile (SELECT RLS enforced)'
);

-- ── 6. Cross-user INSERT is blocked (profiles_insert_owner WITH CHECK) ────────
-- uid3 exists in auth.users but auth.uid()=uid1 ≠ uid3, so WITH CHECK fails.
-- 4-arg form: check errcode only (NULL errmsg skips message-text check).
select throws_ok(
  $$ insert into public.profiles (user_id) values ('33333333-3333-3333-3333-333333333333') $$,
  '42501',
  NULL::text,
  'user1 cannot insert a profile for user3 (INSERT RLS enforced)'
);

-- ── 7. Owner can UPDATE their own profile ────────────────────────────────────
-- WITH at top level (data-modifying CTEs cannot be nested in scalar subqueries).
with upd as (
  update public.profiles
  set updated_at = now()
  where user_id = '11111111-1111-1111-1111-111111111111'
  returning 1
)
select ok(count(*) = 1, 'owner (user1) can update their own profile')
from upd;

-- ── 8. Cross-user UPDATE is blocked (profiles_update_owner USING) ────────────
with upd as (
  update public.profiles
  set updated_at = now()
  where user_id = '22222222-2222-2222-2222-222222222222'
  returning 1
)
select ok(count(*) = 0, 'user1 cannot update user2 profile (UPDATE RLS enforced)')
from upd;

select * from finish();
rollback;
