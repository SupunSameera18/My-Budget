-- 0023_family_schema.sql
-- Epic 7 Story 7.1a: Family schema shape (tables, trigger, is_shared column, RLS)
-- Full 5-condition RLS predicate on transactions added in 0024 (7.1b).

-- ── family_units ──────────────────────────────────────────────────────────────
-- Root entity for a two-person financial partnership.
CREATE TABLE public.family_units (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL    DEFAULT now()
);

-- ── family_members ────────────────────────────────────────────────────────────
-- Associates a user to a family_unit with an immutable join-date anchor.
-- join_date is set at invite-redemption time (7.2) and NEVER updated.
CREATE TABLE public.family_members (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_unit_id UUID        NOT NULL REFERENCES public.family_units(id),
  user_id        UUID        NOT NULL REFERENCES auth.users(id),
  join_date      DATE        NOT NULL,
  hide_personal  BOOLEAN     NOT NULL DEFAULT false,
  joined_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(family_unit_id, user_id)
);

-- ── ≤2 members per family_unit (trigger) ─────────────────────────────────────
-- A multi-row CHECK constraint is not reliable in Postgres (evaluated per-row,
-- not per-statement). A BEFORE INSERT trigger is the correct enforcement point.
-- Raises ERRCODE 23514 so server actions can branch on .code === "23514".
CREATE OR REPLACE FUNCTION public.check_family_size()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM public.family_members
    WHERE family_unit_id = NEW.family_unit_id
  ) >= 2 THEN
    RAISE EXCEPTION 'family_unit cannot have more than 2 members'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_family_size
  BEFORE INSERT ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION public.check_family_size();

-- ── Extend transactions with is_shared ───────────────────────────────────────
-- Forward-only migration: existing rows default to false (personal), no backfill.
ALTER TABLE public.transactions
  ADD COLUMN is_shared BOOLEAN NOT NULL DEFAULT false;

-- ── Table privileges ──────────────────────────────────────────────────────────
-- Always explicit (dev-learnings §12: Supabase CLI 2.104.x does not apply
-- default grants on db reset; every migration must grant what it needs).
GRANT SELECT, INSERT, UPDATE ON public.family_units  TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.family_members TO authenticated;

-- Soft-delete convention: no DELETE policy for authenticated users.
-- Hard-delete is reserved for the GDPR erasure Edge Function (7.12) which uses
-- the service-role key and bypasses RLS entirely.
REVOKE DELETE, TRUNCATE ON public.family_units  FROM anon, authenticated;
REVOKE DELETE, TRUNCATE ON public.family_members FROM anon, authenticated;

-- ── Row-Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.family_units  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

-- family_units: a user may only read the unit they belong to.
CREATE POLICY "member can view own family unit"
  ON public.family_units FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.family_members
      WHERE family_unit_id = family_units.id
        AND user_id = auth.uid()
    )
  );

-- family_members: a user sees only their own membership row.
-- The 5-condition predicate in 7.1b needs to read the partner's row via
-- SECURITY DEFINER — direct authenticated SELECT of the partner's row is
-- intentionally blocked here.
CREATE POLICY "user sees own membership row"
  ON public.family_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- INSERT on family_units and family_members is reserved for the invite-redemption
-- RPC (7.2), which runs as SECURITY DEFINER. No user-facing INSERT policy here.
