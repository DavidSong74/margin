import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────

interface DeletedPage {
  id: string;
  journal_id: string;
  journal_title: string;
  page_number: number;
  transcription_text: string | null;
  deleted_at: string;
  days_remaining: number;
}

// ── Helpers ────────────────────────────────────────────────────

function daysRemaining(deletedAt: string): number {
  const ms = Date.now() - new Date(deletedAt).getTime();
  return Math.max(0, 30 - Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function urgencyColor(days: number, colors: ReturnType<typeof useColors>): string {
  if (days <= 3) return colors.destructive;
  if (days <= 7) return "#e8a020";
  return colors.mutedForeground;
}

// ── Screen ─────────────────────────────────────────────────────

export default function DeletedPagesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const pt = insets.top || 16;
  const pb = insets.bottom + 16;

  const [pages, setPages] = useState<DeletedPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchDeleted = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from("pages")
      .select("id, journal_id, page_number, transcription_text, deleted_at, journals!inner(title, user_id)")
      .not("deleted_at", "is", null)
      .gte("deleted_at", thirtyDaysAgo)
      .order("deleted_at", { ascending: false });

    const rows = (data ?? []) as Array<{
      id: string;
      journal_id: string;
      page_number: number;
      transcription_text: string | null;
      deleted_at: string;
      journals: { title: string; user_id: string };
    }>;

    // Filter to pages owned by this user (RLS should handle it, this is belt-and-suspenders)
    const owned = rows.filter((r) => r.journals.user_id === session.user.id);

    setPages(
      owned.map((r) => ({
        id: r.id,
        journal_id: r.journal_id,
        journal_title: r.journals.title,
        page_number: r.page_number,
        transcription_text: r.transcription_text,
        deleted_at: r.deleted_at,
        days_remaining: daysRemaining(r.deleted_at),
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { fetchDeleted(); }, [fetchDeleted]);

  async function handleRestore(page: DeletedPage) {
    setActionId(page.id);
    await supabase
      .from("pages")
      .update({ deleted_at: null })
      .eq("id", page.id);
    setPages((prev) => prev.filter((p) => p.id !== page.id));
    setActionId(null);
  }

  function handlePermanentDelete(page: DeletedPage) {
    Alert.alert(
      "Delete permanently?",
      `Page ${page.page_number} from "${page.journal_title}" will be gone forever.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete forever",
          style: "destructive",
          onPress: async () => {
            setActionId(page.id);
            await supabase.from("pages").delete().eq("id", page.id);
            setPages((prev) => prev.filter((p) => p.id !== page.id));
            setActionId(null);
          },
        },
      ]
    );
  }

  function renderItem({ item }: { item: DeletedPage }) {
    const isActing = actionId === item.id;
    const dayColor = urgencyColor(item.days_remaining, colors);

    return (
      <View style={[styles.row, { borderColor: colors.border }]}>
        {/* Left: journal info + snippet */}
        <View style={styles.rowBody}>
          <View style={styles.rowMeta}>
            <Feather name="book-open" size={12} color={colors.mutedForeground} />
            <Text
              style={[styles.rowJournal, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}
              numberOfLines={1}
            >
              {item.journal_title}
            </Text>
            <Text style={[styles.rowDot, { color: colors.border }]}>·</Text>
            <Text style={[styles.rowPage, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              p. {item.page_number}
            </Text>
          </View>

          {item.transcription_text ? (
            <Text
              style={[styles.rowSnippet, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
              numberOfLines={2}
            >
              {item.transcription_text.trim()}
            </Text>
          ) : (
            <Text style={[styles.rowSnippet, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              No transcription
            </Text>
          )}

          <Text style={[styles.rowExpiry, { color: dayColor, fontFamily: "Inter_400Regular" }]}>
            {item.days_remaining === 0
              ? "Expires today"
              : `${item.days_remaining} day${item.days_remaining === 1 ? "" : "s"} remaining`}
          </Text>
        </View>

        {/* Right: actions */}
        {isActing ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.actionArea} />
        ) : (
          <View style={styles.actionArea}>
            <TouchableOpacity
              onPress={() => handleRestore(item)}
              style={[styles.actionBtn, { backgroundColor: colors.primary + "18" }]}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Feather name="rotate-ccw" size={15} color={colors.primary} />
              <Text style={[styles.actionLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                Restore
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handlePermanentDelete(item)}
              style={[styles.actionBtn, { backgroundColor: colors.destructive + "12" }]}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Feather name="trash-2" size={15} color={colors.destructive} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: pt + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: colors.foreground, fontFamily: "PlayfairDisplay_600SemiBold" }]}
        >
          Deleted Pages
        </Text>
        <View style={styles.headerRight}>
          {pages.length > 0 && (
            <View style={[styles.countChip, { backgroundColor: colors.destructive + "18" }]}>
              <Text style={[styles.countChipText, { color: colors.destructive, fontFamily: "Inter_600SemiBold" }]}>
                {pages.length}
              </Text>
            </View>
          )}
        </View>
      </View>

      <Text style={[styles.blurb, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Pages are permanently removed after 30 days. Restore a page to put it back in its journal.
      </Text>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : pages.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="check-circle" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "PlayfairDisplay_600SemiBold" }]}>
            Nothing deleted
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Pages you delete from a journal appear here for 30 days before being permanently removed.
          </Text>
        </View>
      ) : (
        <FlatList
          data={pages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: pb }]}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
          )}
        />
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: { width: 36 },
  headerTitle: { flex: 1, fontSize: 22, textAlign: "center" },
  headerRight: { width: 36, alignItems: "flex-end" },
  countChip: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  countChipText: { fontSize: 13 },

  blurb: {
    fontSize: 13,
    paddingHorizontal: 20,
    paddingBottom: 12,
    lineHeight: 18,
  },

  loader: { marginTop: 48 },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: { fontSize: 20, marginTop: 8 },
  emptySubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },

  listContent: { paddingHorizontal: 20 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
  },
  rowBody: { flex: 1, gap: 4 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowJournal: { fontSize: 12, flex: 1 },
  rowDot: { fontSize: 12 },
  rowPage: { fontSize: 12 },
  rowSnippet: { fontSize: 14, lineHeight: 20 },
  rowExpiry: { fontSize: 12, marginTop: 2 },

  actionArea: { alignItems: "center", gap: 6 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionLabel: { fontSize: 13 },

  separator: { height: StyleSheet.hairlineWidth },
});
