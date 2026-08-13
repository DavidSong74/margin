-- ── Secure RPC functions ──────────────────────────────────────────────
-- Changes SECURITY DEFINER to SECURITY INVOKER for RPC functions that
-- do not strictly need to bypass RLS, ensuring RLS policies are enforced.

CREATE OR REPLACE FUNCTION public.get_user_storage_bytes()
RETURNS bigint
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, storage
AS $$
  SELECT COALESCE(
    SUM((o.metadata->>'size')::bigint),
    0
  )
  FROM storage.objects o
  JOIN public.pages p ON o.name = p.image_path
    AND o.bucket_id = 'journal_pages'
  JOIN public.journals j ON j.id = p.journal_id
  WHERE j.user_id = auth.uid()
    AND p.deleted_at IS NULL;
$$;


CREATE OR REPLACE FUNCTION public.get_user_stats()
RETURNS json
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT json_build_object(
    'total_pages',
    (
      SELECT COUNT(p.id)
      FROM pages p
      JOIN journals j ON j.id = p.journal_id
      WHERE j.user_id = auth.uid()
        AND p.deleted_at IS NULL
    ),
    'total_words',
    (
      SELECT COALESCE(SUM(
        array_length(string_to_array(trim(p.transcription_text), ' '), 1)
      ), 0)
      FROM pages p
      JOIN journals j ON j.id = p.journal_id
      WHERE j.user_id = auth.uid()
        AND p.deleted_at IS NULL
        AND p.transcription_text IS NOT NULL
        AND trim(p.transcription_text) <> ''
    ),
    'total_journals',
    (
      SELECT COUNT(id)
      FROM journals
      WHERE user_id = auth.uid()
    ),
    'streak_days',
    (
      WITH daily AS (
        SELECT DISTINCT DATE(p.created_at) AS day
        FROM pages p
        JOIN journals j ON j.id = p.journal_id
        WHERE j.user_id = auth.uid()
          AND p.deleted_at IS NULL
        ORDER BY day DESC
      ),
      numbered AS (
        SELECT day, ROW_NUMBER() OVER (ORDER BY day DESC) AS rn
        FROM daily
      ),
      streak AS (
        SELECT day FROM numbered
        WHERE (CURRENT_DATE - day) = (rn - 1)
      )
      SELECT COUNT(*) FROM streak
    )
  );
$$;
