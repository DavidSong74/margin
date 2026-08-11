-- ── Enable Realtime on pages ──────────────────────────────────────────────────
-- Required for postgres_changes subscriptions in journal/[id].tsx and index.tsx.
--
-- REPLICA IDENTITY FULL is needed so that filtered subscriptions
-- (e.g. filter: `journal_id=eq.<uuid>`) can match on non-primary-key columns.
-- Without it, Supabase Realtime only sees the primary key in the change payload
-- and cannot evaluate the filter, which causes the client error:
--   "cannot add postgres_changes callbacks for realtime:journal-pages-…"

ALTER TABLE public.pages REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.pages;
