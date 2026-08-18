import { Feather } from "@expo/vector-icons";
import { useFocusEffect, router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  DeviceEventEmitter,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────

interface ResurfacePage {
  page_id: string;
  journal_id: string;
  journal_title: string;
  page_number: number;
  transcription_text: string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────

function formatEntryDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const TAB_BAR_H = 84;

// ── Main screen ───────────────────────────────────────────────

export default function ReviewScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [page, setPage] = useState<ResurfacePage | null | undefined>(undefined); // undefined = not yet loaded
  const [advancing, setAdvancing] = useState(false);

  const pt = Platform.OS === "web" ? 67 : insets.top;
  const pb = Platform.OS === "web" ? 34 + TAB_BAR_H : insets.bottom + TAB_BAR_H;

  // ── Fetch a page to resurface ──────────────────────────────

  const fetchPage = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("get_resurface_page");
      if (error) throw error;
      const rows = data as ResurfacePage[] | null;
      if (rows && rows.length > 0) {
        setPage(rows[0]);
        DeviceEventEmitter.emit("review_queue_updated", true);
      } else {
        setPage(null);
        DeviceEventEmitter.emit("review_queue_updated", false);
      }
    } catch (err) {
      console.error("[Review] get_resurface_page error:", err);
      setPage(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setPage(undefined);
      fetchPage();
    }, [fetchPage])
  );

  // ── "Next entry" handler ───────────────────────────────────

  async function handleNext() {
    if (!page || advancing) return;
    setAdvancing(true);
    try {
      await supabase
        .from("pages")
        .update({ resurfaced_at: new Date().toISOString() })
        .eq("id", page.page_id);
    } catch (err) {
      console.error("[Review] mark resurfaced error:", err);
    }
    setPage(undefined);
    await fetchPage();
    setAdvancing(false);
  }

  // ── Loading state ──────────────────────────────────────────

  if (page === undefined || advancing) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: pt + 16 }]}>
          <Text style={[styles.screenTitle, { color: colors.foreground, fontFamily: "PlayfairDisplay_700Bold" }]}>
            Review
          </Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  // ── Empty / all caught up ──────────────────────────────────

  if (page === null) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: pt + 16 }]}>
          <Text style={[styles.screenTitle, { color: colors.foreground, fontFamily: "PlayfairDisplay_700Bold" }]}>
            Review
          </Text>
        </View>
        <View style={styles.centered}>
          <View style={[styles.iconCircle, { backgroundColor: colors.muted }]}>
            <Feather name="check-circle" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "PlayfairDisplay_600SemiBold" }]}>
            You're all caught up
          </Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            No pages to resurface right now.{"\n"}Come back in a few days.
          </Text>
        </View>
      </View>
    );
  }

  // ── Card view ──────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: pt + 16 }]}>
        <Text style={[styles.screenTitle, { color: colors.foreground, fontFamily: "PlayfairDisplay_700Bold" }]}>
          Review
        </Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          A page from your past
        </Text>
      </View>

      {/* Entry card */}
      <View style={styles.cardWrap}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Card meta */}
          <View style={styles.cardMeta}>
            <Feather name="book-open" size={13} color={colors.mutedForeground} />
            <Text
              style={[styles.cardJournal, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}
              numberOfLines={1}
            >
              {page.journal_title}
            </Text>
            <Text style={[styles.cardDot, { color: colors.border }]}>·</Text>
            <Text style={[styles.cardPage, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              p. {page.page_number}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Transcription text */}
          <ScrollView
            style={styles.textScroll}
            contentContainerStyle={styles.textScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text
              style={[
                styles.entryText,
                { color: colors.foreground, fontFamily: "PlayfairDisplay_400Regular" },
              ]}
            >
              {page.transcription_text}
            </Text>
          </ScrollView>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Date */}
          <Text style={[styles.cardDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {formatEntryDate(page.created_at)}
          </Text>
        </View>
      </View>

      {/* Actions */}
      <View style={[styles.actions, { paddingBottom: pb + 16 }]}>
        <TouchableOpacity
          style={[styles.ghostBtn, { borderColor: colors.border }]}
          onPress={() =>
            router.push({
              pathname: "/journal/[id]",
              params: {
                id: page.journal_id,
                title: page.journal_title,
                initial_page: String(page.page_number),
              },
            })
          }
          activeOpacity={0.7}
        >
          <Feather name="external-link" size={15} color={colors.foreground} />
          <Text style={[styles.ghostBtnText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
            View in journal
          </Text>
        </TouchableOpacity>

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={handleNext}
        >
          <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>
            Next entry
          </Text>
          <Feather name="arrow-right" size={16} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 2,
  },
  screenTitle: {
    fontSize: 30,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 14,
    opacity: 0.7,
  },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 40,
    paddingBottom: 80,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 22,
    letterSpacing: -0.3,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    opacity: 0.8,
  },

  cardWrap: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: "hidden",
    paddingVertical: 16,
    paddingHorizontal: 20,
  },

  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 12,
  },
  cardJournal: {
    fontSize: 12,
    flex: 1,
  },
  cardDot: { fontSize: 12 },
  cardPage: { fontSize: 12 },

  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },

  textScroll: { flex: 1 },
  textScrollContent: { paddingBottom: 8 },
  entryText: {
    fontSize: 18,
    lineHeight: 30,
    letterSpacing: 0.1,
  },

  cardDate: {
    fontSize: 12,
    marginTop: 4,
  },

  actions: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 10,
    alignItems: "center",
  },
  ghostBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  ghostBtnText: { fontSize: 14 },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 48,
    borderRadius: 12,
  },
  primaryBtnText: {
    fontSize: 15,
    color: "#fff",
  },
});
