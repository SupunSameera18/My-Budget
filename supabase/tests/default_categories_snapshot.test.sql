-- Cross-validation snapshot: DEFAULT_CATEGORIES (TypeScript) vs seed_default_categories() (DB)
-- Ensures the TypeScript constant and the PL/pgSQL function stay in sync.
-- [Task 9 — story 1-6 deferred item]
--
-- UUID block: 11111111-1006-*
--   snapshot user: 11111111-1006-4000-8000-000000000001

BEGIN;

SELECT plan(6);

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed a fresh user so handle_new_user_categories fires seed_default_categories()
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES (
  '11111111-1006-4000-8000-000000000001',
  'snapshot-1006@example.com',
  crypt('password', gen_salt('bf')),
  now(), now(), now()
);

-- ── T1: total count matches TypeScript DEFAULT_CATEGORIES (14 entries) ────────
SELECT is(
  (SELECT count(*)::int FROM public.categories
   WHERE user_id = '11111111-1006-4000-8000-000000000001'
     AND archived_at IS NULL),
  14,
  'T1: seed_default_categories() creates exactly 14 categories (matches DEFAULT_CATEGORIES.length)'
);

-- ── T2: income count = 4 ─────────────────────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM public.categories
   WHERE user_id = '11111111-1006-4000-8000-000000000001'
     AND type = 'income'
     AND archived_at IS NULL),
  4,
  'T2: exactly 4 income categories seeded (Salary, Freelance, Investment, Other Income)'
);

-- ── T3: expense count = 10 ───────────────────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM public.categories
   WHERE user_id = '11111111-1006-4000-8000-000000000001'
     AND type = 'expense'
     AND archived_at IS NULL),
  10,
  'T3: exactly 10 expense categories seeded'
);

-- ── T4: all 4 income names are present ───────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM public.categories
   WHERE user_id = '11111111-1006-4000-8000-000000000001'
     AND type = 'income'
     AND name IN ('Salary', 'Freelance', 'Investment', 'Other Income')
     AND archived_at IS NULL),
  4,
  'T4: all 4 income category names match TypeScript DEFAULT_CATEGORIES'
);

-- ── T5: all 10 expense names are present ─────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM public.categories
   WHERE user_id = '11111111-1006-4000-8000-000000000001'
     AND type = 'expense'
     AND name IN (
       'Housing', 'Groceries', 'Dining Out', 'Transport', 'Utilities',
       'Healthcare', 'Entertainment', 'Shopping', 'Education', 'Other'
     )
     AND archived_at IS NULL),
  10,
  'T5: all 10 expense category names match TypeScript DEFAULT_CATEGORIES'
);

-- ── T6: idempotency — calling seed_default_categories() a second time does not
-- create duplicates (ON CONFLICT ... DO NOTHING on the unique index) ───────────
SELECT seed_default_categories('11111111-1006-4000-8000-000000000001');

SELECT is(
  (SELECT count(*)::int FROM public.categories
   WHERE user_id = '11111111-1006-4000-8000-000000000001'
     AND archived_at IS NULL),
  14,
  'T6: calling seed_default_categories() twice is idempotent — still exactly 14 categories'
);

SELECT * FROM finish();
ROLLBACK;
