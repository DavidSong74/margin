-- Migration: 015_fix_email_search.sql
-- Prevent user email enumeration in friend lookup RPC

DROP FUNCTION IF EXISTS public.find_user_by_email(text);

CREATE OR REPLACE FUNCTION public.find_user_by_email(p_email text)
RETURNS TABLE (user_id uuid, user_email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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
