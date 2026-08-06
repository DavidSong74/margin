-- ── Push tokens table ────────────────────────────────────────────────────────
-- Stores Expo push tokens per user for server-side notifications.
-- on_this_day_enabled mirrors the user's profile.tsx preference so the
-- daily-digest Edge Function can filter without touching AsyncStorage.

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token               text        NOT NULL,
  on_this_day_enabled boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_tokens_token_key UNIQUE (token)
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can fully manage their own tokens
CREATE POLICY "users_manage_own_tokens"
  ON public.push_tokens
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for daily-digest function queries (filters by on_this_day_enabled)
CREATE INDEX IF NOT EXISTS push_tokens_on_this_day_idx
  ON public.push_tokens (on_this_day_enabled)
  WHERE on_this_day_enabled = true;
