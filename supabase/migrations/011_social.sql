-- ============================================================
-- Margin — Social Features (S1)
-- Tables: friendships, notifications, shared_entries,
--         feed_likes, feed_comments
-- RPCs:   find_user_by_email, get_friends,
--         get_pending_friend_requests, get_feed, get_comments
-- Triggers: notify on friend request / acceptance
-- ============================================================

-- ── friendships ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS friendships (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id  uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  addressee_id  uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at    timestamptz DEFAULT now() NOT NULL,
  updated_at    timestamptz DEFAULT now() NOT NULL,
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships (addressee_id, status);
CREATE INDEX IF NOT EXISTS friendships_requester_idx ON friendships (requester_id, status);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendships: select own"
  ON friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "friendships: insert own"
  ON friendships FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

-- Only the addressee may accept or decline
CREATE POLICY "friendships: update own"
  ON friendships FOR UPDATE
  USING (auth.uid() = addressee_id);

-- Either party may unfriend
CREATE POLICY "friendships: delete own"
  ON friendships FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);


-- ── notifications ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  type          text NOT NULL,   -- 'friend_request' | 'friend_accepted' | 'on_this_day'
  from_user_id  uuid REFERENCES auth.users ON DELETE SET NULL,
  data          jsonb DEFAULT '{}' NOT NULL,
  read          boolean DEFAULT false NOT NULL,
  created_at    timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications: select own"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notifications: update own"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "notifications: delete own"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);


-- ── shared_entries ────────────────────────────────────────────
-- A shared entry is a snippet or full page a user publishes to their friends.
CREATE TABLE IF NOT EXISTS shared_entries (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  page_id       uuid REFERENCES pages ON DELETE CASCADE NOT NULL,
  excerpt_text  text NOT NULL,
  share_type    text NOT NULL DEFAULT 'page'
                CHECK (share_type IN ('page', 'snippet')),
  created_at    timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS shared_entries_user_idx ON shared_entries (user_id, created_at DESC);

ALTER TABLE shared_entries ENABLE ROW LEVEL SECURITY;

-- Author sees their own entries
CREATE POLICY "shared_entries: select own"
  ON shared_entries FOR SELECT
  USING (auth.uid() = user_id);

-- Mutually accepted friends see each other's entries
CREATE POLICY "shared_entries: select friends"
  ON shared_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.requester_id = shared_entries.user_id AND f.addressee_id = auth.uid())
          OR
          (f.addressee_id = shared_entries.user_id AND f.requester_id = auth.uid())
        )
    )
  );

CREATE POLICY "shared_entries: insert own"
  ON shared_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "shared_entries: delete own"
  ON shared_entries FOR DELETE
  USING (auth.uid() = user_id);


-- ── feed_likes ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feed_likes (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  entry_id    uuid REFERENCES shared_entries ON DELETE CASCADE NOT NULL,
  created_at  timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, entry_id)
);

CREATE INDEX IF NOT EXISTS feed_likes_entry_idx ON feed_likes (entry_id);

ALTER TABLE feed_likes ENABLE ROW LEVEL SECURITY;

-- Anyone who can see the entry can see its likes
CREATE POLICY "feed_likes: select visible"
  ON feed_likes FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM shared_entries se WHERE se.id = feed_likes.entry_id)
  );

CREATE POLICY "feed_likes: insert own"
  ON feed_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "feed_likes: delete own"
  ON feed_likes FOR DELETE
  USING (auth.uid() = user_id);


-- ── feed_comments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feed_comments (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  entry_id      uuid REFERENCES shared_entries ON DELETE CASCADE NOT NULL,
  comment_text  text NOT NULL,
  created_at    timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS feed_comments_entry_idx ON feed_comments (entry_id, created_at);

ALTER TABLE feed_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feed_comments: select visible"
  ON feed_comments FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM shared_entries se WHERE se.id = feed_comments.entry_id)
  );

CREATE POLICY "feed_comments: insert own"
  ON feed_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "feed_comments: delete own"
  ON feed_comments FOR DELETE
  USING (auth.uid() = user_id);


-- ── RPCs ──────────────────────────────────────────────────────

-- Find a user by email. SECURITY DEFINER required to query auth.users.
CREATE OR REPLACE FUNCTION public.find_user_by_email(p_email text)
RETURNS TABLE (user_id uuid, user_email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id AS user_id, email::text AS user_email
  FROM auth.users
  WHERE lower(email) = lower(p_email)
    AND id <> auth.uid()
  LIMIT 1;
$$;

-- List accepted friends for the current user.
CREATE OR REPLACE FUNCTION public.get_friends()
RETURNS TABLE (
  friend_id     uuid,
  friendship_id uuid,
  since         timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    CASE WHEN requester_id = auth.uid() THEN addressee_id ELSE requester_id END AS friend_id,
    id   AS friendship_id,
    updated_at AS since
  FROM friendships
  WHERE status = 'accepted'
    AND (requester_id = auth.uid() OR addressee_id = auth.uid())
  ORDER BY updated_at DESC;
$$;

-- Pending friend requests addressed to me.
CREATE OR REPLACE FUNCTION public.get_pending_friend_requests()
RETURNS TABLE (
  friendship_id uuid,
  from_user_id  uuid,
  created_at    timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT id AS friendship_id, requester_id AS from_user_id, created_at
  FROM friendships
  WHERE addressee_id = auth.uid()
    AND status = 'pending'
  ORDER BY created_at DESC;
$$;

-- Feed entries from friends (own entries + friends' entries) with aggregates.
CREATE OR REPLACE FUNCTION public.get_feed(p_limit int DEFAULT 20, p_offset int DEFAULT 0)
RETURNS TABLE (
  entry_id      uuid,
  user_id       uuid,
  page_id       uuid,
  excerpt_text  text,
  share_type    text,
  created_at    timestamptz,
  like_count    bigint,
  comment_count bigint,
  viewer_liked  boolean
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    se.id            AS entry_id,
    se.user_id,
    se.page_id,
    se.excerpt_text,
    se.share_type,
    se.created_at,
    COUNT(DISTINCT fl.id)              AS like_count,
    COUNT(DISTINCT fc.id)              AS comment_count,
    BOOL_OR(fl.user_id = auth.uid())   AS viewer_liked
  FROM shared_entries se
  LEFT JOIN feed_likes    fl ON fl.entry_id = se.id
  LEFT JOIN feed_comments fc ON fc.entry_id = se.id
  WHERE (
    se.user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.requester_id = se.user_id AND f.addressee_id = auth.uid())
          OR
          (f.addressee_id = se.user_id AND f.requester_id = auth.uid())
        )
    )
  )
  GROUP BY se.id, se.user_id, se.page_id, se.excerpt_text, se.share_type, se.created_at
  ORDER BY se.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- Comments for a specific feed entry.
CREATE OR REPLACE FUNCTION public.get_comments(p_entry_id uuid)
RETURNS TABLE (
  comment_id    uuid,
  user_id       uuid,
  comment_text  text,
  created_at    timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT id AS comment_id, user_id, comment_text, created_at
  FROM feed_comments
  WHERE entry_id = p_entry_id
  ORDER BY created_at;
$$;


-- ── Triggers ──────────────────────────────────────────────────

-- Create a notification when someone sends a friend request.
CREATE OR REPLACE FUNCTION notify_friend_request_fn()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    INSERT INTO notifications (user_id, type, from_user_id, data)
    VALUES (
      NEW.addressee_id,
      'friend_request',
      NEW.requester_id,
      jsonb_build_object('friendship_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_friend_request ON friendships;
CREATE TRIGGER notify_friend_request
  AFTER INSERT ON friendships
  FOR EACH ROW EXECUTE FUNCTION notify_friend_request_fn();

-- Create a notification when a friend request is accepted.
CREATE OR REPLACE FUNCTION notify_friend_accepted_fn()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    INSERT INTO notifications (user_id, type, from_user_id, data)
    VALUES (
      NEW.requester_id,
      'friend_accepted',
      NEW.addressee_id,
      jsonb_build_object('friendship_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_friend_accepted ON friendships;
CREATE TRIGGER notify_friend_accepted
  AFTER UPDATE ON friendships
  FOR EACH ROW EXECUTE FUNCTION notify_friend_accepted_fn();
