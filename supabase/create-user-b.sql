DO $$
DECLARE
  v_uid uuid := 'ffffffff-ffff-4fff-8fff-000000000002';
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'user-b@test.local',
    crypt('TestPass123!', gen_salt('bf')),
    now(), '', '', '', '', now(), now(),
    '{"provider":"email","providers":["email"]}', '{}'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    'user-b@test.local', v_uid,
    json_build_object('sub', v_uid::text, 'email', 'user-b@test.local', 'email_verified', false),
    'email', now(), now(), now()
  ) ON CONFLICT (provider, provider_id) DO NOTHING;
END $$;
