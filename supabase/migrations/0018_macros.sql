-- Story 5.1: macros table + RLS + macro_application_id on transactions

-- macros table
CREATE TABLE public.macros (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           text NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
  amount_minor   bigint NOT NULL CHECK (amount_minor > 0),
  account_id     uuid REFERENCES public.accounts(id),
  goal_id        uuid REFERENCES public.goals(id),
  category_id    uuid NOT NULL REFERENCES public.categories(id),
  last_used_at   timestamptz,
  archived_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT macros_target_exclusive CHECK (
    (account_id IS NOT NULL)::int + (goal_id IS NOT NULL)::int = 1
  )
);

-- Indexes
CREATE INDEX idx_macros_user_id ON public.macros (user_id);
CREATE INDEX idx_macros_last_used_at ON public.macros (last_used_at);

-- RLS on macros
ALTER TABLE public.macros ENABLE ROW LEVEL SECURITY;
CREATE POLICY macros_select_owner ON public.macros FOR SELECT USING (user_id = auth.uid());
CREATE POLICY macros_insert_owner ON public.macros FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY macros_update_owner ON public.macros FOR UPDATE USING (user_id = auth.uid());
-- No DELETE policy — soft-delete only via archived_at
REVOKE DELETE, TRUNCATE ON public.macros FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.macros TO authenticated;

-- Add macro_application_id to transactions (nullable tag column for linked-set grouping)
ALTER TABLE public.transactions ADD COLUMN macro_application_id uuid;

-- Partial index for efficient linked-set queries
CREATE INDEX idx_transactions_macro_application_id
  ON public.transactions (macro_application_id)
  WHERE macro_application_id IS NOT NULL;
