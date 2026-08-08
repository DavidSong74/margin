import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────

interface GlossaryEntry {
  id: string;
  original_word: string;
  corrected_word: string;
  updated_at: string;
}

// ── GlossaryItem (memoized FlatList cell) ─────────────────────

interface GlossaryItemProps {
  item: GlossaryEntry;
  colors: ReturnType<typeof useColors>;
  isEditing: boolean;
  isSaving: boolean;
  onEdit: (item: GlossaryEntry) => void;
  onCancelEdit: () => void;
  onSaveEdit: (item: GlossaryEntry, newText: string) => void;
  onDelete: (item: GlossaryEntry) => void;
}

const GlossaryItem = React.memo(function GlossaryItem({
  item,
  colors,
  isEditing,
  isSaving,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: GlossaryItemProps) {
  const [localText, setLocalText] = useState(item.corrected_word);

  // Sync local text when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setLocalText(item.corrected_word);
    }
  }, [isEditing, item.corrected_word]);

  return (
    <View style={styles.entryRow}>
      {/* Original word — struck through */}
      <Text
        style={[
          styles.originalWord,
          { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
        ]}
        numberOfLines={1}
      >
        {item.original_word}
      </Text>

      <Feather
        name="arrow-right"
        size={13}
        color={colors.mutedForeground}
        style={styles.arrow}
      />

      {/* Corrected word — editable inline */}
      {isEditing ? (
        <TextInput
          style={[
            styles.editInput,
            {
              color: colors.foreground,
              borderColor: colors.primary,
              fontFamily: "Inter_400Regular",
            },
          ]}
          value={localText}
          onChangeText={setLocalText}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => onSaveEdit(item, localText)}
        />
      ) : (
        <Text
          style={[
            styles.correctedWord,
            { color: colors.foreground, fontFamily: "Inter_600SemiBold" },
          ]}
          numberOfLines={1}
        >
          {item.corrected_word}
        </Text>
      )}

      {/* Action buttons */}
      <View style={styles.entryActions}>
        {isEditing ? (
          <>
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.primary} style={styles.actionBtn} />
            ) : (
              <TouchableOpacity
                onPress={() => onSaveEdit(item, localText)}
                style={styles.actionBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="check" size={17} color={colors.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={onCancelEdit}
              style={styles.actionBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x" size={17} color={colors.mutedForeground} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              onPress={() => onEdit(item)}
              style={styles.actionBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="edit-2" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onDelete(item)}
              style={styles.actionBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="trash-2" size={15} color={colors.destructive} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
});

// ── Screen ─────────────────────────────────────────────────────

export default function GlossaryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const pt = insets.top || 16;
  const pb = insets.bottom + 16;

  const [entries, setEntries] = useState<GlossaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const { data } = await supabase
      .from("glossary")
      .select("id, original_word, corrected_word, updated_at")
      .eq("user_id", session.user.id)
      .order("updated_at", { ascending: false });
    setEntries(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleDelete = useCallback((entry: GlossaryEntry) => {
    Alert.alert(
      "Remove entry",
      `Remove "${entry.original_word} → ${entry.corrected_word}" from your glossary? Future transcriptions will no longer apply this correction.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await supabase.from("glossary").delete().eq("id", entry.id);
            setEntries((prev) => prev.filter((e) => e.id !== entry.id));
          },
        },
      ],
    );
  }, []);

  const handleEdit = useCallback((entry: GlossaryEntry) => {
    setEditingId(entry.id);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleSaveEdit = useCallback(async (entry: GlossaryEntry, newText: string) => {
    const trimmed = newText.trim();
    if (!trimmed || trimmed === entry.corrected_word) {
      setEditingId(null);
      return;
    }
    setSavingId(entry.id);
    await supabase
      .from("glossary")
      .update({ corrected_word: trimmed, updated_at: new Date().toISOString() })
      .eq("id", entry.id);
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, corrected_word: trimmed } : e))
    );
    setSavingId(null);
    setEditingId(null);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: GlossaryEntry }) => (
      <GlossaryItem
        item={item}
        colors={colors}
        isEditing={editingId === item.id}
        isSaving={savingId === item.id}
        onEdit={handleEdit}
        onCancelEdit={handleCancelEdit}
        onSaveEdit={handleSaveEdit}
        onDelete={handleDelete}
      />
    ),
    [colors, editingId, savingId, handleEdit, handleCancelEdit, handleSaveEdit, handleDelete]
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
          style={[
            styles.headerTitle,
            { color: colors.foreground, fontFamily: "PlayfairDisplay_600SemiBold" },
          ]}
        >
          Glossary
        </Text>

        <View style={styles.headerRight}>
          {entries.length > 0 && (
            <View style={[styles.countChip, { backgroundColor: colors.primary + "18" }]}>
              <Text
                style={[
                  styles.countChipText,
                  { color: colors.primary, fontFamily: "Inter_600SemiBold" },
                ]}
              >
                {entries.length}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Subheader blurb */}
      <Text
        style={[
          styles.blurb,
          { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
        ]}
      >
        These corrections are fed into Gemini on every new transcription to improve accuracy.
      </Text>

      {/* Body */}
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : entries.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="book-open" size={40} color={colors.mutedForeground} />
          <Text
            style={[
              styles.emptyTitle,
              { color: colors.foreground, fontFamily: "PlayfairDisplay_600SemiBold" },
            ]}
          >
            No corrections yet
          </Text>
          <Text
            style={[
              styles.emptySubtitle,
              { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
            ]}
          >
            When you review uncertain words in a journal transcription, the
            corrections you confirm are saved here and used to improve future
            transcriptions.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: pb },
          ]}
          ItemSeparatorComponent={() => (
            <View
              style={[styles.separator, { backgroundColor: colors.border }]}
            />
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
  headerTitle: {
    flex: 1,
    fontSize: 22,
    textAlign: "center",
  },
  headerRight: {
    width: 36,
    alignItems: "flex-end",
  },
  countChip: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
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
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },

  listContent: { paddingHorizontal: 20 },

  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
  },
  originalWord: {
    flex: 1,
    fontSize: 15,
    textDecorationLine: "line-through",
  },
  arrow: { marginHorizontal: 8 },
  correctedWord: {
    flex: 1.5,
    fontSize: 15,
  },
  editInput: {
    flex: 1.5,
    fontSize: 15,
    borderBottomWidth: 1.5,
    paddingVertical: 2,
  },
  entryActions: {
    flexDirection: "row",
    gap: 4,
    marginLeft: 10,
  },
  actionBtn: { padding: 4 },

  separator: { height: StyleSheet.hairlineWidth },
});
