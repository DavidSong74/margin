-- 1. Add sort_order column
ALTER TABLE journals ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- 2. Update get_journals_with_counts to order by sort_order ASC, then created_at DESC
DROP FUNCTION IF EXISTS public.get_journals_with_counts();
CREATE OR REPLACE FUNCTION public.get_journals_with_counts()
RETURNS TABLE (
  id              uuid,
  title           text,
  cover_style     text,
  cover_color     text,
  cover_image_url text,
  is_private      boolean,
  created_at      timestamptz,
  sort_order      integer,
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
    j.sort_order,
    COUNT(p.id) FILTER (WHERE p.deleted_at IS NULL)                      AS page_count,
    COUNT(p.id) FILTER (
      WHERE p.deleted_at IS NULL
        AND p.transcription_status IN ('pending', 'processing')
    )                                                                      AS pending_count
  FROM journals j
  LEFT JOIN pages p ON p.journal_id = j.id
  WHERE j.user_id = auth.uid()
  GROUP BY j.id
  ORDER BY j.sort_order ASC, j.created_at DESC;
$$;

-- 3. Create reorder_journals RPC
CREATE OR REPLACE FUNCTION public.reorder_journals(p_journal_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_id uuid;
  v_idx integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  FOR v_idx IN 1..array_length(p_journal_ids, 1) LOOP
    v_id := p_journal_ids[v_idx];
    
    UPDATE journals
    SET sort_order = v_idx - 1
    WHERE id = v_id AND user_id = v_user_id;
  END LOOP;
END;
$$;
