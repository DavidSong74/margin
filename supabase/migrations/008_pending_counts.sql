-- ── Batch pending transcription counts ───────────────────────────────────────
-- Called by index.tsx after journals are fetched to show per-journal
-- transcription progress badges. Ownership is enforced via journals join.

CREATE OR REPLACE FUNCTION public.journal_pending_counts(
  p_journal_ids uuid[]
)
RETURNS TABLE (
  journal_id    uuid,
  pending_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.journal_id,
    COUNT(*)::bigint AS pending_count
  FROM pages p
  JOIN journals j ON j.id = p.journal_id
  WHERE p.journal_id = ANY(p_journal_ids)
    AND j.user_id = auth.uid()
    AND p.transcription_status IN ('pending', 'processing')
    AND p.deleted_at IS NULL
  GROUP BY p.journal_id;
$$;

-- Schedule daily-digest via pg_cron (run once after applying this migration):
-- SELECT cron.schedule('daily-digest', '0 10 * * *',
--   $$SELECT net.http_post(
--     url := '<YOUR_SUPABASE_URL>/functions/v1/daily-digest',
--     headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
--     body := '{}'::jsonb
--   ) AS request_id;$$
-- );
