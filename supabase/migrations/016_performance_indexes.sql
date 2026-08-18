-- Migration: 016_performance_indexes.sql
-- Add partial composite and compound indexes for high-frequency queries

-- 1. Partial compound index for fast active page queries and ordering in Reader
CREATE INDEX IF NOT EXISTS pages_journal_active_idx
  ON public.pages (journal_id, page_number)
  WHERE deleted_at IS NULL;

-- 2. Compound index for feed likes lookup per entry and user
CREATE INDEX IF NOT EXISTS feed_likes_entry_user_idx
  ON public.feed_likes (entry_id, user_id);

-- 3. Compound index for feed comments lookup ordered by creation
CREATE INDEX IF NOT EXISTS feed_comments_entry_created_idx
  ON public.feed_comments (entry_id, created_at DESC);
