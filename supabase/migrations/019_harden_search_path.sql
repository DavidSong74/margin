-- Migration: 019_harden_search_path.sql
-- Fix search path hijacking vulnerability in SECURITY DEFINER RPC

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
    (pg_catalog.substring(u.email, 1, 1) || '***@' || pg_catalog.split_part(u.email, '@', 2))::text AS user_email
  FROM auth.users u
  WHERE pg_catalog.lower(u.email) = v_target_email
    AND u.id <> v_caller_id
  LIMIT 1;
END;
$$;
