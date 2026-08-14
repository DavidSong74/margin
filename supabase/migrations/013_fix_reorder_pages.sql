-- Migration 013_fix_reorder_pages.sql
CREATE OR REPLACE FUNCTION public.reorder_pages(
  p_journal_id uuid,
  p_page_ids   uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- 1. Verify caller owns this journal
  IF NOT EXISTS (
    SELECT 1 FROM journals WHERE id = p_journal_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden: journal does not belong to caller';
  END IF;

  -- 2. Temporarily set page numbers to negative values to bypass UNIQUE(journal_id, page_number)
  UPDATE pages
  SET page_number = -page_number
  WHERE journal_id = p_journal_id
    AND deleted_at IS NULL;

  -- 3. Update sequential page_number matching array position in p_page_ids
  WITH new_order AS (
    SELECT u.page_id, u.ordinal AS new_num
    FROM unnest(p_page_ids) WITH ORDINALITY AS u(page_id, ordinal)
  )
  UPDATE pages p
  SET page_number = n.new_num
  FROM new_order n
  WHERE p.id = n.page_id
    AND p.journal_id = p_journal_id
    AND p.deleted_at IS NULL;
END;
$$;
