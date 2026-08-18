-- Migration: 017_word_count.sql
-- Store pre-computed word_count column on pages table for fast stats aggregation

ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS word_count integer DEFAULT 0 NOT NULL;

-- Backfill word_count for existing pages
UPDATE public.pages
SET word_count = CASE 
  WHEN transcription_text IS NULL OR trim(transcription_text) = '' THEN 0
  ELSE array_length(regexp_split_to_array(trim(transcription_text), '\s+'), 1)
END;

-- Fast index for word count aggregation
CREATE INDEX IF NOT EXISTS pages_journal_word_count_idx
  ON public.pages (journal_id, word_count)
  WHERE deleted_at IS NULL;

-- Update get_user_stats to use pre-computed word_count column directly
CREATE OR REPLACE FUNCTION public.get_user_stats()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
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
      SELECT COALESCE(SUM(p.word_count), 0)::bigint
      FROM pages p
      JOIN journals j ON j.id = p.journal_id
      WHERE j.user_id = auth.uid()
        AND p.deleted_at IS NULL
    ),
    'total_journals',
    (
      SELECT COUNT(id)
      FROM journals
      WHERE user_id = auth.uid()
        AND deleted_at IS NULL
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
