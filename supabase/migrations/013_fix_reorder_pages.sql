-- ── Fix page reordering RPC unique constraint collision ────────────────────────
-- In 007_page_reorder.sql, reorder_pages updated page_number sequentially in a loop.
-- Because of UNIQUE(journal_id, page_number), updating page 2 to 1 while page 1 is 
-- still at 1 triggered a unique_violation exception.
-- This migration updates page numbers in two phases:
--   Phase A: Shift all active pages to negative temporary offsets (-10000 - row_number)
--   Phase B: Set new sequential page numbers matching array position in p_page_ids

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
  -- 1. Guard against empty or null input
  IF p_page_ids IS NULL OR array_length(p_page_ids, 1) IS NULL OR array_length(p_page_ids, 1) = 0 THEN
    RETURN;
  END IF;

  -- 2. Verify the caller owns this journal
  IF NOT EXISTS (
    SELECT 1 FROM journals WHERE id = p_journal_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden: journal does not belong to caller';
  END IF;

  -- 3. Phase A: Shift active pages to temporary negative offsets to avoid UNIQUE constraint collisions
  WITH active_pages AS (
    SELECT id, ROW_NUMBER() OVER () as temp_idx
    FROM pages
    WHERE journal_id = p_journal_id AND deleted_at IS NULL
  )
  UPDATE pages p
  SET page_number = -10000 - ap.temp_idx
  FROM active_pages ap
  WHERE p.id = ap.id;

  -- 4. Phase B: Apply new sequential numbers matching array order in p_page_ids
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
