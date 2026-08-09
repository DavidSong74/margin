-- ── Combined journals + count RPC (O2 optimization) ──────────────────────────
-- Returns all journals for the current user with total page count and pending
-- transcription count in a single query, replacing two separate round trips
-- (journals select + journal_pending_counts RPC) in the Library screen.

CREATE OR REPLACE FUNCTION public.get_journals_with_counts()
RETURNS TABLE (
  id              uuid,
  title           text,
  cover_style     text,
  cover_color     text,
  cover_image_url text,
  is_private      boolean,
  created_at      timestamptz,
  page_count      bigint,
  pending_count   bigint
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    j.id,
    j.title,
    j.cover_style,
    j.cover_color,
    j.cover_image_url,
    j.is_private,
    j.created_at,
    COUNT(p.id) FILTER (WHERE p.deleted_at IS NULL)                      AS page_count,
    COUNT(p.id) FILTER (
      WHERE p.deleted_at IS NULL
        AND p.transcription_status IN ('pending', 'processing')
    )                                                                      AS pending_count
  FROM journals j
  LEFT JOIN pages p ON p.journal_id = j.id
  WHERE j.user_id = auth.uid()
  GROUP BY j.id
  ORDER BY j.created_at DESC;
$$;
