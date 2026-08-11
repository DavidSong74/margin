import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CommentsSheet } from "@/components/CommentsSheet";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

interface FeedEntry {
  entry_id: string;
  user_id: string;
  author_email: string;
  page_id: string;
  excerpt_text: string;
  share_type: string;
  created_at: string;
  like_count: number;
  comment_count: number;
  viewer_liked: boolean;
}

const TAB_BAR_H = 84;
const TEXT_LINE_LIMIT = 10;

// ── FeedCard ──────────────────────────────────────────────────

interface FeedCardProps {
  entry: FeedEntry;
  colors: ReturnType<typeof useColors>;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onLike: (id: string) => void;
  onOpenComments: (id: string) => void;
}

const FeedCard = React.memo(function FeedCard({
  entry,
  colors,
  isExpanded,
  onToggleExpand,
  onLike,
  onOpenComments,
}: FeedCardProps) {
  const lines = entry.excerpt_text.split("\n");
  const isTruncated = lines.length > TEXT_LINE_LIMIT;
  const displayText =
    isExpanded || !isTruncated
      ? entry.excerpt_text
      : lines.slice(0, TEXT_LINE_LIMIT).join("\n") + "…";

  const dateStr = new Date(entry.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      {/* Author + date */}
      <View style={styles.cardHeader}>
        <Text
          style={[
            styles.authorEmail,
            { color: colors.foreground, fontFamily: "Inter_600SemiBold" },
          ]}
          numberOfLines={1}
        >
          {entry.author_email}
        </Text>
        <Text
          style={[
            styles.cardDate,
            { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
          ]}
        >
          {dateStr}
        </Text>
      </View>

      {/* Transcription text */}
      <TouchableOpacity
        onPress={() => isTruncated && onToggleExpand(entry.entry_id)}
        activeOpacity={isTruncated ? 0.7 : 1}
      >
        <Text
          style={[
            styles.entryText,
            { color: colors.foreground, fontFamily: "PlayfairDisplay_400Regular" },
          ]}
        >
          {displayText}
        </Text>
        {isTruncated && !isExpanded && (
          <Text
            style={[
              styles.showMore,
              { color: colors.primary, fontFamily: "Inter_600SemiBold" },
            ]}
          >
            Show more
          </Text>
        )}
        {isTruncated && isExpanded && (
          <Text
            style={[
              styles.showMore,
              { color: colors.primary, fontFamily: "Inter_600SemiBold" },
            ]}
          >
            Show less
          </Text>
        )}
      </TouchableOpacity>

      {/* Actions */}
      <View style={styles.cardActions}>
        <TouchableOpacity
          onPress={() => onLike(entry.entry_id)}
          style={styles.actionBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather
            name="heart"
            size={18}
            color={entry.viewer_liked ? colors.destructive : colors.mutedForeground}
          />
          {entry.like_count > 0 && (
            <Text
              style={[
                styles.actionCount,
                { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
              ]}
            >
              {entry.like_count}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onOpenComments(entry.entry_id)}
          style={styles.actionBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="message-circle" size={18} color={colors.mutedForeground} />
          {entry.comment_count > 0 && (
            <Text
              style={[
                styles.actionCount,
                { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
              ]}
            >
              {entry.comment_count}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ── FeedScreen ────────────────────────────────────────────────

export default function FeedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [commentEntryId, setCommentEntryId] = useState<string | null>(null);

  // Stable ref so handleLike doesn't need entries in its dep array
  const entriesRef = useRef<FeedEntry[]>([]);
  entriesRef.current = entries;

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      supabase.rpc("get_feed").then(({ data }) => {
        setEntries((data as FeedEntry[]) ?? []);
        setLoading(false);
      });
    }, [])
  );

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleLike = useCallback(async (entryId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const entry = entriesRef.current.find((e) => e.entry_id === entryId);
    if (!entry) return;

    const wasLiked = entry.viewer_liked;

    // Optimistic update
    setEntries((prev) =>
      prev.map((e) =>
        e.entry_id === entryId
          ? {
              ...e,
              viewer_liked: !wasLiked,
              like_count: wasLiked ? e.like_count - 1 : e.like_count + 1,
            }
          : e
      )
    );

    if (wasLiked) {
      await supabase
        .from("feed_likes")
        .delete()
        .eq("entry_id", entryId)
        .eq("user_id", session.user.id);
    } else {
      await supabase
        .from("feed_likes")
        .insert({ user_id: session.user.id, entry_id: entryId });
    }
  }, []);

  const handleOpenComments = useCallback((id: string) => {
    setCommentEntryId(id);
  }, []);

  const pt = insets.top;
  const pb = insets.bottom + TAB_BAR_H;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: pt + 8 }]}>
        <Text
          style={[
            styles.title,
            { color: colors.foreground, fontFamily: "PlayfairDisplay_700Bold" },
          ]}
        >
          Feed
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator
          style={{ marginTop: 48 }}
          color={colors.primary}
          size="large"
        />
      ) : entries.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="users" size={40} color={colors.mutedForeground} />
          <Text
            style={[
              styles.emptyTitle,
              { color: colors.foreground, fontFamily: "PlayfairDisplay_600SemiBold" },
            ]}
          >
            Nothing here yet
          </Text>
          <Text
            style={[
              styles.emptyBody,
              { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
            ]}
          >
            Add friends via the inbox (tap M in the Library) and ask them to
            share a journal entry.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.entry_id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: pb },
          ]}
          renderItem={({ item }) => (
            <FeedCard
              entry={item}
              colors={colors}
              isExpanded={expandedIds.has(item.entry_id)}
              onToggleExpand={handleToggleExpand}
              onLike={handleLike}
              onOpenComments={handleOpenComments}
            />
          )}
        />
      )}

      <CommentsSheet
        entryId={commentEntryId}
        onClose={() => setCommentEntryId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 30, letterSpacing: -0.5 },

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 12,
  },

  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  authorEmail: { flex: 1, fontSize: 13 },
  cardDate: { fontSize: 12, flexShrink: 0 },

  entryText: { fontSize: 16, lineHeight: 26 },
  showMore: { fontSize: 13, marginTop: 4 },

  cardActions: {
    flexDirection: "row",
    gap: 20,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  actionCount: { fontSize: 13 },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingBottom: 80,
    gap: 14,
  },
  emptyTitle: {
    fontSize: 22,
    letterSpacing: -0.3,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    opacity: 0.8,
  },
});
