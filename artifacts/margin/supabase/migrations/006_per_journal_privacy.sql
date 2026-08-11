-- ── Per-journal privacy ───────────────────────────────────────────────────────
-- is_private = true means the journal reader requires biometric auth before
-- showing page content. Enforced in the client (journal/[id].tsx); the column
-- also drives the lock badge in the library (index.tsx).

ALTER TABLE public.journals
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

-- Index for quick filtering in library queries that include is_private
CREATE INDEX IF NOT EXISTS journals_is_private_idx
  ON public.journals (user_id, is_private)
  WHERE is_private = true;
