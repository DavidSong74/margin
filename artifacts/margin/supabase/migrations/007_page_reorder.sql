-- ── Page reordering RPC ───────────────────────────────────────────────────────
-- Accepts an ordered list of page UUIDs for a given journal and renumbers
-- page_number sequentially (1, 2, 3, …) to match the supplied order.
-- Ownership is verified inside the function so RLS cannot be bypassed.

CREATE OR REPLACE FUNCTION public.reorder_pages(
  p_journal_id uuid,
  p_page_ids   uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  -- Verify the caller owns this journal
  SELECT user_id INTO v_owner_id
  FROM journals
  WHERE id = p_journal_id;

  IF v_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Forbidden: journal does not belong to caller';
  END IF;

  -- Renumber pages in the order provided
  FOR i IN 1..array_length(p_page_ids, 1) LOOP
    UPDATE pages
      SET page_number = i
      WHERE id = p_page_ids[i]
        AND journal_id = p_journal_id
        AND deleted_at IS NULL;
  END LOOP;
END;
$$;
