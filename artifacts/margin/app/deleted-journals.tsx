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

interface DeletedJournal {
  id: string;
  title: string;
  cover_style: string;
  cover_color: string | null;
  deleted_at: string;
  page_count: number;
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

// ── DeletedJournalItem (memoized FlatList cell) ───────────────────

interface DeletedJournalItemProps {
  item: DeletedJournal;
  colors: ReturnType<typeof useColors>;
  isActing: boolean;
  onRestore: (item: DeletedJournal) => void;
  onPermanentDelete: (item: DeletedJournal) => void;
}

const DeletedJournalItem = React.memo(function DeletedJournalItem({
  item,
  colors,
  isActing,
  onRestore,
  onPermanentDelete,
}: DeletedJournalItemProps) {
  const dayColor = urgencyColor(item.days_remaining, colors);

  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <View style={styles.rowBody}>
        <Text
          style={[styles.rowTitle, { color: colors.foreground, fontFamily: "PlayfairDisplay_600SemiBold" }]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        
        <View style={styles.rowMeta}>
          <Text style={[styles.rowPage, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {item.page_count} page{item.page_count === 1 ? "" : "s"}
          </Text>
          <Text style={[styles.rowDot, { color: colors.border }]}>·</Text>
          <Text style={[styles.rowExpiry, { color: dayColor, fontFamily: "Inter_400Regular" }]}>
            {item.days_remaining === 0
              ? "Expires today"
              : `${item.days_remaining} day${item.days_remaining === 1 ? "" : "s"} remaining`}
          </Text>
        </View>
      </View>

      {isActing ? (
        <ActivityIndicator size="small" color={colors.primary} style={styles.actionArea} />
      ) : (
        <View style={styles.actionArea}>
          <TouchableOpacity
            onPress={() => onRestore(item)}
            style={[styles.actionBtn, { backgroundColor: colors.primary + "18" }]}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Feather name="rotate-ccw" size={15} color={colors.primary} />
            <Text style={[styles.actionLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
              Restore
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onPermanentDelete(item)}
            style={[styles.actionBtn, { backgroundColor: colors.destructive + "12" }]}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Feather name="trash-2" size={15} color={colors.destructive} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

// ── Screen ─────────────────────────────────────────────────────

export default function DeletedJournalsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const pt = insets.top || 16;
  const pb = insets.bottom + 16;

  const [journals, setJournals] = useState<DeletedJournal[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchDeleted = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const { data } = await supabase.rpc("get_deleted_journals");

    const rows = (data ?? []) as Array<{
      id: string;
      title: string;
      cover_style: string;
      cover_color: string | null;
      deleted_at: string;
      page_count: number;
    }>;

    setJournals(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        cover_style: r.cover_style,
        cover_color: r.cover_color,
        page_count: r.page_count,
        deleted_at: r.deleted_at,
        days_remaining: daysRemaining(r.deleted_at),
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { fetchDeleted(); }, [fetchDeleted]);

  const handleRestore = useCallback(async (journal: DeletedJournal) => {
    setActionId(journal.id);
    await supabase
      .from("journals")
      .update({ deleted_at: null })
      .eq("id", journal.id);
    setJournals((prev) => prev.filter((j) => j.id !== journal.id));
    setActionId(null);
  }, []);

  const handlePermanentDelete = useCallback((journal: DeletedJournal) => {
    Alert.alert(
      "Delete permanently?",
      `"${journal.title}" and all its pages will be gone forever.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete forever",
          style: "destructive",
          onPress: async () => {
            setActionId(journal.id);
            // 1. Delete all pages of the journal
            await supabase.from("pages").delete().eq("journal_id", journal.id);
            // 2. Delete the journal row itself
            await supabase.from("journals").delete().eq("id", journal.id);
            
            setJournals((prev) => prev.filter((j) => j.id !== journal.id));
            setActionId(null);
          },
        },
      ]
    );
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: DeletedJournal }) => (
      <DeletedJournalItem
        item={item}
        colors={colors}
        isActing={actionId === item.id}
        onRestore={handleRestore}
        onPermanentDelete={handlePermanentDelete}
      />
    ),
    [colors, actionId, handleRestore, handlePermanentDelete]
  );

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
          Deleted Journals
        </Text>
        <View style={styles.headerRight}>
          {journals.length > 0 && (
            <View style={[styles.countChip, { backgroundColor: colors.destructive + "18" }]}>
              <Text style={[styles.countChipText, { color: colors.destructive, fontFamily: "Inter_600SemiBold" }]}>
                {journals.length}
              </Text>
            </View>
          )}
        </View>
      </View>

      <Text style={[styles.blurb, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Journals are permanently removed after 30 days. Restore to put a journal back on your shelf.
      </Text>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : journals.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="check-circle" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "PlayfairDisplay_600SemiBold" }]}>
            Nothing deleted
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Journals you delete appear here for 30 days before being permanently removed.
          </Text>
        </View>
      ) : (
        <FlatList
          data={journals}
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
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowTitle: { fontSize: 16 },
  rowDot: { fontSize: 12 },
  rowPage: { fontSize: 13 },
  rowExpiry: { fontSize: 13 },

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
