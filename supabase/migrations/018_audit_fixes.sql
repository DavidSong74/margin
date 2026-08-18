-- ============================================================================
-- Migration: 018_audit_fixes.sql
-- Description: Implement missing RPCs, security hardening on social feed,
--              search filtering for soft-deleted journals, and streak fix.
-- ============================================================================

-- 1. Security Fix: Feed likes & comments authorization check (SEC-01)
DROP POLICY IF EXISTS "feed_likes: insert own" ON public.feed_likes;
CREATE POLICY "feed_likes: insert own" ON public.feed_likes FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.shared_entries se
    WHERE se.id = feed_likes.entry_id
      AND (
        se.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.friendships f
          WHERE f.status = 'accepted'
            AND ((f.requester_id = se.user_id AND f.addressee_id = auth.uid())
              OR (f.addressee_id = se.user_id AND f.requester_id = auth.uid()))
        )
      )
  )
);

DROP POLICY IF EXISTS "feed_comments: insert own" ON public.feed_comments;
CREATE POLICY "feed_comments: insert own" ON public.feed_comments FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.shared_entries se
    WHERE se.id = feed_comments.entry_id
      AND (
        se.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.friendships f
          WHERE f.status = 'accepted'
            AND ((f.requester_id = se.user_id AND f.addressee_id = auth.uid())
              OR (f.addressee_id = se.user_id AND f.requester_id = auth.uid()))
        )
      )
  )
);

-- 2. Security Fix: get_comments with access check and email masking (SEC-02)
DROP FUNCTION IF EXISTS public.get_comments(uuid);
CREATE OR REPLACE FUNCTION public.get_comments(p_entry_id uuid)
RETURNS TABLE (
  comment_id uuid,
  user_id uuid,
  author_email text,
  comment_text text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT 
    fc.id AS comment_id, 
    fc.user_id,
    (regexp_replace(u.email, '^(.)[^@]+', '\1***') || '@' || split_part(u.email, '@', 2))::text AS author_email,
    fc.comment_text, 
    fc.created_at
  FROM feed_comments fc
  JOIN auth.users u ON u.id = fc.user_id
  JOIN shared_entries se ON se.id = fc.entry_id
  WHERE fc.entry_id = p_entry_id
    AND (
      se.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.status = 'accepted'
          AND ((f.requester_id = se.user_id AND f.addressee_id = auth.uid())
            OR (f.addressee_id = se.user_id AND f.requester_id = auth.uid()))
      )
    )
  ORDER BY fc.created_at;
$$;

-- 3. Missing RPC: get_resurface_page (Review tab)
DROP FUNCTION IF EXISTS public.get_resurface_page();
CREATE OR REPLACE FUNCTION public.get_resurface_page()
RETURNS TABLE (
  page_id uuid,
  journal_id uuid,
  journal_title text,
  page_number integer,
  transcription_text text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id AS page_id,
    p.journal_id,
    j.title AS journal_title,
    p.page_number,
    p.transcription_text,
    p.created_at
  FROM pages p
  JOIN journals j ON j.id = p.journal_id
  WHERE j.user_id = auth.uid()
    AND j.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND p.transcription_status = 'done'
    AND p.transcription_text IS NOT NULL
    AND (p.resurfaced_at IS NULL OR p.resurfaced_at < now() - interval '7 days')
  ORDER BY random()
  LIMIT 1;
$$;

-- 4. Missing RPC: get_deleted_journals (Trash screen)
DROP FUNCTION IF EXISTS public.get_deleted_journals();
CREATE OR REPLACE FUNCTION public.get_deleted_journals()
RETURNS TABLE (
  id uuid,
  title text,
  cover_style text,
  cover_color text,
  cover_image_url text,
  is_private boolean,
  created_at timestamptz,
  deleted_at timestamptz,
  page_count bigint
)
LANGUAGE sql
SECURITY DEFINER
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
    j.deleted_at,
    COUNT(p.id) AS page_count
  FROM journals j
  LEFT JOIN pages p ON p.journal_id = j.id
  WHERE j.user_id = auth.uid()
    AND j.deleted_at IS NOT NULL
    AND j.deleted_at >= (now() - interval '30 days')
  GROUP BY j.id
  ORDER BY j.deleted_at DESC;
$$;

-- 5. Missing RPC: get_storage_info (Profile storage bar)
DROP FUNCTION IF EXISTS public.get_storage_info();
CREATE OR REPLACE FUNCTION public.get_storage_info()
RETURNS TABLE (used_bytes bigint, limit_bytes bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT 
    COALESCE(
      (SELECT SUM((metadata->>'size')::bigint)
       FROM storage.objects
       WHERE (storage.foldername(name))[1] = auth.uid()::text),
      0
    )::bigint AS used_bytes,
    (15 * 1024 * 1024 * 1024)::bigint AS limit_bytes;
$$;

-- 6. Search Fix: Exclude soft-deleted journals from full-text search
CREATE OR REPLACE FUNCTION public.search_pages(query text)
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
    AND j.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND p.fts   @@ plainto_tsquery('english', query)
  ORDER BY ts_rank(p.fts, plainto_tsquery('english', query)) DESC
  LIMIT 50;
$$;

-- 7. Stats Fix: Accurate streak calculation handling active streaks across days
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
        AND j.deleted_at IS NULL
        AND p.deleted_at IS NULL
    ),
    'total_words',
    (
      SELECT COALESCE(SUM(p.word_count), 0)::bigint
      FROM pages p
      JOIN journals j ON j.id = p.journal_id
      WHERE j.user_id = auth.uid()
        AND j.deleted_at IS NULL
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
          AND j.deleted_at IS NULL
          AND p.deleted_at IS NULL
        ORDER BY day DESC
      ),
      streak_calc AS (
        SELECT 
          day,
          day - (ROW_NUMBER() OVER (ORDER BY day DESC) * INTERVAL '1 day') AS grp
        FROM daily
      )
      SELECT COUNT(*)
      FROM streak_calc
      WHERE grp = (
        SELECT grp FROM streak_calc 
        WHERE day IN (CURRENT_DATE, CURRENT_DATE - INTERVAL '1 day')
        LIMIT 1
      )
    )
  );
$$;
