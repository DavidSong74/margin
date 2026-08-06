-- Soft-delete support for pages
-- Pages with deleted_at set are hidden from normal queries but retained for 30 days.

ALTER TABLE pages ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Index for efficient deleted-pages queries
CREATE INDEX IF NOT EXISTS pages_deleted_at_idx ON pages (deleted_at)
  WHERE deleted_at IS NOT NULL;
