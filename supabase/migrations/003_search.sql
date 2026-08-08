-- ── Full-text search setup ────────────────────────────────────────────────────

-- Generated FTS column — stays in sync with transcription_text automatically
ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(transcription_text, ''))
  ) STORED;

-- GIN index for fast FTS queries
CREATE INDEX IF NOT EXISTS pages_fts_idx ON pages USING gin(fts);

-- Per-journal fetch index (used every time a journal is opened)
CREATE INDEX IF NOT EXISTS pages_journal_id_idx ON pages (journal_id);

-- Ownership check index (every query joins journals to verify user)
CREATE INDEX IF NOT EXISTS journals_user_id_idx ON journals (user_id);

-- ── search_pages RPC ─────────────────────────────────────────────────────────
-- Called by search.tsx as: supabase.rpc("search_pages", { query })
-- Returns up to 50 results ranked by relevance, scoped to auth.uid().
-- Snippet uses [[word]] markers which SnippetText in search.tsx parses.

CREATE OR REPLACE FUNCTION search_pages(query text)
RETURNS TABLE (
  page_id       uuid,
  journal_id    uuid,
  journal_title text,
  page_number   int,
  snippet       text
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.id                                          AS page_id,
    p.journal_id,
    j.title                                       AS journal_title,
    p.page_number,
    regexp_replace(
      ts_headline(
        'english',
        coalesce(p.transcription_text, ''),
        plainto_tsquery('english', query),
        'StartSel=[[, StopSel=]], MaxWords=35, MinWords=15, ShortWord=3, HighlightAll=false'
      ),
      E'\\s+', ' ', 'g'
    )                                             AS snippet
  FROM pages p
  JOIN journals j ON j.id = p.journal_id
  WHERE
    j.user_id   = auth.uid()
    AND p.deleted_at IS NULL
    AND p.fts   @@ plainto_tsquery('english', query)
  ORDER BY ts_rank(p.fts, plainto_tsquery('english', query)) DESC
  LIMIT 50;
$$;
