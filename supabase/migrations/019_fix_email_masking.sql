-- Migration: 019_fix_email_masking.sql
-- Fix PII leak in email masking for short emails and secure search paths

DROP FUNCTION IF EXISTS public.find_user_by_email(text);
CREATE OR REPLACE FUNCTION public.find_user_by_email(p_email text)
RETURNS TABLE (user_id uuid, user_email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_target_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
BEGIN
  -- Require caller authentication
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Require valid email query length
  IF v_target_email IS NULL OR pg_catalog.length(v_target_email) < 3 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    (pg_catalog.left(u.email, 1) || '***@' || pg_catalog.split_part(u.email, '@', 2))::text AS user_email
  FROM auth.users u
  WHERE pg_catalog.lower(u.email) = v_target_email
    AND u.id <> v_caller_id
  LIMIT 1;
END;
$$;


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
SET search_path = ''
AS $$
  SELECT
    fc.id AS comment_id,
    fc.user_id,
    (pg_catalog.left(u.email, 1) || '***@' || pg_catalog.split_part(u.email, '@', 2))::text AS author_email,
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
