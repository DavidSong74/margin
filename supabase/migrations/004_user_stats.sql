-- ── User storage stats ───────────────────────────────────────────────────────
-- Exposes real storage consumption to the client via an RPC that queries
-- storage.objects joined through the user's own pages/journals.

CREATE OR REPLACE FUNCTION public.get_user_storage_bytes()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    SUM((o.metadata->>'size')::bigint),
    0
  )
  FROM storage.objects o
  JOIN public.pages p ON o.name = p.image_path
    AND o.bucket_id = 'journal_pages'
  JOIN public.journals j ON j.id = p.journal_id
  WHERE j.user_id = auth.uid()
    AND p.deleted_at IS NULL;
$$;
