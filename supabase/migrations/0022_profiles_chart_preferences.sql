-- NULL means all charts enabled (user hasn't customized yet)
ALTER TABLE public.profiles
  ADD COLUMN chart_preferences JSONB DEFAULT NULL;
