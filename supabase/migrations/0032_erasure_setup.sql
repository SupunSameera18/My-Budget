-- Migration 0032: GDPR Account Erasure Setup
--
-- 1. Inserts a tombstone sentinel row into auth.users.
--    UUID 00000000-0000-0000-0000-000000000001 represents "Former member" after erasure.
--    All FKs referencing auth.users(id) stay intact; the tombstone row is the target.
--    The tombstone has no password, no OAuth provider, no session — unreachable except
--    by the service-role erase-account Edge Function.
--
-- 2. Creates erasure_audit: PII-free record of erasure events (no user_id, no email).

-- Tombstone sentinel for anonymized Shared records
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  created_at,
  updated_at,
  confirmation_sent_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'former-member@tombstone.invalid',
  '',
  now(),
  now(),
  now(),
  '{"provider":"tombstone","providers":["tombstone"]}'::jsonb,
  '{}'::jsonb,
  false,
  'authenticated'
)
ON CONFLICT (id) DO NOTHING;

-- Audit table: PII-free record of completed erasures
CREATE TABLE IF NOT EXISTS public.erasure_audit (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  erased_at      TIMESTAMPTZ NOT NULL    DEFAULT now(),
  family_unit_id UUID,         -- NULL for solo path
  path           TEXT        NOT NULL    CHECK (path IN ('solo', 'family')),
  notes          TEXT        -- optional non-PII notes
  -- intentionally NO user_id, NO email (PII compliance)
);

-- RLS: only service role may read/write (no authenticated policies)
ALTER TABLE public.erasure_audit ENABLE ROW LEVEL SECURITY;

-- Explicit grant: authenticated users have NO access (no SELECT policy = blocked by RLS)
-- Service role bypasses RLS entirely.
GRANT SELECT, INSERT ON public.erasure_audit TO service_role;
