-- ============================================================================
-- Migration: 019_secure_rpc_search_path.sql
-- Description: Security Fix: Prevent search path hijacking in SECURITY DEFINER RPCs.
--              Updates SECURITY DEFINER functions to use an empty search_path
--              (SET search_path = '') and fully schema-qualify all table references.
-- ============================================================================

-- 1. get_comments (last defined in 018_audit_fixes.sql)
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
SET search_path = ''
AS $$
  SELECT
    fc.id AS comment_id,
    fc.user_id,
    (regexp_replace(u.email, '^(.)[^@]+', '\1***') || '@' || split_part(u.email, '@', 2))::text AS author_email,
    fc.comment_text,
    fc.created_at
  FROM public.feed_comments fc
  JOIN auth.users u ON u.id = fc.user_id
  JOIN public.shared_entries se ON se.id = fc.entry_id
  WHERE fc.entry_id = p_entry_id
    AND (
      se.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status = 'accepted'
          AND ((f.requester_id = se.user_id AND f.addressee_id = auth.uid())
            OR (f.addressee_id = se.user_id AND f.requester_id = auth.uid()))
      )
    )
  ORDER BY fc.created_at;
$$;

-- 2. get_resurface_page (last defined in 018_audit_fixes.sql)
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
SET search_path = ''
AS $$
  SELECT
    p.id AS page_id,
    p.journal_id,
    j.title AS journal_title,
    p.page_number,
    p.transcription_text,
    p.created_at
  FROM public.pages p
  JOIN public.journals j ON j.id = p.journal_id
  WHERE j.user_id = auth.uid()
    AND j.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND p.transcription_status = 'done'
    AND p.transcription_text IS NOT NULL
    AND (p.resurfaced_at IS NULL OR p.resurfaced_at < now() - interval '7 days')
  ORDER BY random()
  LIMIT 1;
$$;

-- 3. get_deleted_journals (last defined in 018_audit_fixes.sql)
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
SET search_path = ''
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
  FROM public.journals j
  LEFT JOIN public.pages p ON p.journal_id = j.id
  WHERE j.user_id = auth.uid()
    AND j.deleted_at IS NOT NULL
    AND j.deleted_at >= (now() - interval '30 days')
  GROUP BY j.id
  ORDER BY j.deleted_at DESC;
$$;

-- 4. get_storage_info (last defined in 018_audit_fixes.sql)
CREATE OR REPLACE FUNCTION public.get_storage_info()
RETURNS TABLE (used_bytes bigint, limit_bytes bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
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

-- 5. get_user_stats (last defined in 018_audit_fixes.sql)
CREATE OR REPLACE FUNCTION public.get_user_stats()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT json_build_object(
    'total_pages',
    (
      SELECT COUNT(p.id)
      FROM public.pages p
      JOIN public.journals j ON j.id = p.journal_id
      WHERE j.user_id = auth.uid()
        AND j.deleted_at IS NULL
        AND p.deleted_at IS NULL
    ),
    'total_words',
    (
      SELECT COALESCE(SUM(p.word_count), 0)::bigint
      FROM public.pages p
      JOIN public.journals j ON j.id = p.journal_id
      WHERE j.user_id = auth.uid()
        AND j.deleted_at IS NULL
        AND p.deleted_at IS NULL
    ),
    'total_journals',
    (
      SELECT COUNT(id)
      FROM public.journals
      WHERE user_id = auth.uid()
        AND deleted_at IS NULL
    ),
    'streak_days',
    (
      WITH daily AS (
        SELECT DISTINCT DATE(p.created_at) AS day
        FROM public.pages p
        JOIN public.journals j ON j.id = p.journal_id
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

-- 6. find_user_by_email (last defined in 015_fix_email_search.sql)
CREATE OR REPLACE FUNCTION public.find_user_by_email(p_email text)
RETURNS TABLE (user_id uuid, user_email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_target_email text := lower(trim(p_email));
BEGIN
  -- Require caller authentication
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Require valid email query length
  IF v_target_email IS NULL OR length(v_target_email) < 3 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    (regexp_replace(u.email, '^(.)[^@]+', '\1***') || '@' || split_part(u.email, '@', 2))::text AS user_email
  FROM auth.users u
  WHERE lower(u.email) = v_target_email
    AND u.id <> v_caller_id
  LIMIT 1;
END;
$$;

-- 7. get_friends (last defined in 011_social.sql)
CREATE OR REPLACE FUNCTION public.get_friends()
RETURNS TABLE (
  friend_id     uuid,
  friendship_id uuid,
  friend_email  text,
  since         timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE WHEN f.requester_id = auth.uid() THEN f.addressee_id ELSE f.requester_id END AS friend_id,
    f.id   AS friendship_id,
    u.email::text AS friend_email,
    f.updated_at AS since
  FROM public.friendships f
  JOIN auth.users u ON u.id = CASE WHEN f.requester_id = auth.uid() THEN f.addressee_id ELSE f.requester_id END
  WHERE f.status = 'accepted'
    AND (f.requester_id = auth.uid() OR f.addressee_id = auth.uid())
  ORDER BY f.updated_at DESC;
$$;

-- 8. get_pending_friend_requests (last defined in 011_social.sql)
CREATE OR REPLACE FUNCTION public.get_pending_friend_requests()
RETURNS TABLE (
  friendship_id   uuid,
  from_user_id    uuid,
  from_user_email text,
  created_at      timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT f.id AS friendship_id, f.requester_id AS from_user_id,
    u.email::text AS from_user_email,
    f.created_at
  FROM public.friendships f
  JOIN auth.users u ON u.id = f.requester_id
  WHERE f.addressee_id = auth.uid()
    AND f.status = 'pending'
  ORDER BY f.created_at DESC;
$$;

-- 9. get_feed (last defined in 011_social.sql)
CREATE OR REPLACE FUNCTION public.get_feed(p_limit int DEFAULT 20, p_offset int DEFAULT 0)
RETURNS TABLE (
  entry_id      uuid,
  user_id       uuid,
  author_email  text,
  page_id       uuid,
  excerpt_text  text,
  share_type    text,
  created_at    timestamptz,
  like_count    bigint,
  comment_count bigint,
  viewer_liked  boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    se.id            AS entry_id,
    se.user_id,
    u.email::text    AS author_email,
    se.page_id,
    se.excerpt_text,
    se.share_type,
    se.created_at,
    COUNT(DISTINCT fl.id)              AS like_count,
    COUNT(DISTINCT fc.id)              AS comment_count,
    BOOL_OR(fl.user_id = auth.uid())   AS viewer_liked
  FROM public.shared_entries se
  JOIN auth.users u ON u.id = se.user_id
  LEFT JOIN public.feed_likes    fl ON fl.entry_id = se.id
  LEFT JOIN public.feed_comments fc ON fc.entry_id = se.id
  WHERE (
    se.user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.requester_id = se.user_id AND f.addressee_id = auth.uid())
          OR
          (f.addressee_id = se.user_id AND f.requester_id = auth.uid())
        )
    )
  )
  GROUP BY se.id, se.user_id, u.email, se.page_id, se.excerpt_text, se.share_type, se.created_at
  ORDER BY se.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;
