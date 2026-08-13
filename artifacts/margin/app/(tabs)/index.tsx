import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { InboxOverlay } from "@/components/InboxOverlay";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

const H_PAD = 20;
const COL_GAP = 12;
const SPINE_W = 9;
const TAB_BAR_H = 84;
const MAX_CONTENT_W = 430;

// ── Types ────────────────────────────────────────────────────

interface JournalItem {
  id: string;
  title: string;
  coverStyle: "solid" | "image";
  coverColor?: string;
  coverImage?: string; // signed URL at query time
  coverImagePath?: string; // storage path (for signed URL generation)
  pageCount: number;
  createdAt: string;
  isPrivate: boolean;
  pendingCount: number;
}

type JournalsWithCountsRow = Database["public"]["Functions"]["get_journals_with_counts"]["Returns"][number];

type GridItem = { type: "new" } | { type: "journal"; journal: JournalItem };

interface CardDims {
  cardW: number;
  cardH: number;
}

// ── Helpers ──────────────────────────────────────────────────

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ── Sub-components ───────────────────────────────────────────

function JournalCover({
  journal,
  cardW,
  cardH,
}: { journal: JournalItem } & CardDims) {
  const colors = useColors();
  const isImage = journal.coverStyle === "image";

  const webShadow =
    Platform.OS === "web"
      ? { boxShadow: "2px 6px 18px rgba(74, 63, 53, 0.18)" }
      : {};

  return (
    <View
      style={[
        styles.coverOuter,
        webShadow,
        {
          width: cardW,
          height: cardH,
          backgroundColor: journal.coverColor ?? colors.card,
          borderColor: "rgba(0,0,0,0.07)",
        },
      ]}
    >
      {isImage && journal.coverImage ? (
        <>
          <Image
            source={{ uri: journal.coverImage }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          <View style={styles.imageScrim} />
        </>
      ) : null}

      {/* Book spine */}
      <View style={styles.spine} />

      {/* Title */}
      <View style={[styles.coverTitleWrap, { left: SPINE_W + 10 }]}>
        <Text
          style={[
            styles.coverTitle,
            {
              color: isImage ? "#fff" : "#3a3028",
              fontFamily: "PlayfairDisplay_600SemiBold",
            },
          ]}
          numberOfLines={3}
        >
          {journal.title}
        </Text>
      </View>

      {/* Lock badge — top right corner */}
      {journal.isPrivate && (
        <View style={styles.lockBadge}>
          <Feather name="lock" size={10} color="#fff" />
        </View>
      )}

      {/* Pending transcription indicator — bottom right corner */}
      {journal.pendingCount > 0 && (
        <View style={styles.pendingBadge}>
          <ActivityIndicator size="small" color="#fff" style={{ transform: [{ scale: 0.65 }] }} />
        </View>
      )}
    </View>
  );
}

function SkeletonCard({ cardW, cardH }: CardDims) {
  const colors = useColors();
  return (
    <View style={{ marginBottom: COL_GAP }}>
      <View
        style={{
          width: cardW,
          height: cardH,
          borderRadius: 10,
          backgroundColor: colors.muted,
        }}
      />
      <View
        style={{
          height: 12,
          width: cardW * 0.7,
          backgroundColor: colors.muted,
          borderRadius: 4,
          marginTop: 8,
        }}
      />
      <View
        style={{
          height: 10,
          width: cardW * 0.45,
          backgroundColor: colors.muted,
          borderRadius: 4,
          marginTop: 4,
        }}
      />
    </View>
  );
}

function NewJournalTile({ cardW, cardH }: CardDims) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.newTile,
        {
          width: cardW,
          height: cardH,
          borderColor: colors.primary,
        },
      ]}
    >
      <View
        style={[
          styles.newIconCircle,
          { backgroundColor: colors.primary + "18" },
        ]}
      >
        <Feather name="plus" size={22} color={colors.primary} />
      </View>
      <Text
        style={[
          styles.newTileText,
          { color: colors.primary, fontFamily: "Inter_500Medium" },
        ]}
      >
        New journal
      </Text>
    </View>
  );
}

function EmptyState() {
  const colors = useColors();
  return (
    <View style={styles.emptyWrap}>
      <View
        style={[styles.emptyIconCircle, { backgroundColor: colors.muted }]}
      >
        <Feather name="book-open" size={36} color={colors.mutedForeground} />
      </View>
      <Text
        style={[
          styles.emptyTitle,
          {
            color: colors.foreground,
            fontFamily: "PlayfairDisplay_600SemiBold",
          },
        ]}
      >
        Your shelf is empty
      </Text>
      <Text
        style={[
          styles.emptySubtitle,
          { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
        ]}
      >
        Photograph your first journal page{"\n"}to start your archive.
      </Text>
      <TouchableOpacity
        style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/journal/new");
        }}
        activeOpacity={0.82}
      >
        <Feather name="plus" size={16} color="#fff" />
        <Text
          style={[styles.emptyBtnText, { fontFamily: "Inter_600SemiBold" }]}
        >
          Start your first journal
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── LibraryGridItem (memoized FlatList cell) ──────────────────

const LibraryGridItem = React.memo(function LibraryGridItem({
  item,
  cardW,
  cardH,
  colors,
  onMenuPress,
}: {
  item: GridItem;
  cardW: number;
  cardH: number;
  colors: ReturnType<typeof useColors>;
  onMenuPress: (journal: JournalItem) => void;
}) {
  return (
    <View style={{ marginBottom: COL_GAP }}>
      {item.type === "new" ? (
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/journal/new");
          }}
          activeOpacity={0.7}
        >
          <NewJournalTile cardW={cardW} cardH={cardH} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push({
              pathname: "/journal/[id]",
              params: {
                id: item.journal.id,
                title: item.journal.title,
                isPrivate: String(item.journal.isPrivate),
              },
            });
          }}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onMenuPress(item.journal);
          }}
          delayLongPress={400}
          activeOpacity={0.82}
        >
          <View style={{ position: "relative" }}>
            <JournalCover
              journal={item.journal}
              cardW={cardW}
              cardH={cardH}
            />
            {/* 3-dot menu button — bottom-right of cover */}
            <TouchableOpacity
              style={styles.menuDotBtn}
              onPress={(e) => {
                e.stopPropagation();
                Haptics.selectionAsync();
                onMenuPress(item.journal);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="more-vertical" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text
            style={[
              styles.journalName,
              {
                color: colors.foreground,
                fontFamily: "Inter_600SemiBold",
              },
            ]}
            numberOfLines={1}
          >
            {item.journal.title}
          </Text>
          <Text
            style={[
              styles.journalMeta,
              {
                color: colors.mutedForeground,
                fontFamily: "Inter_400Regular",
              },
            ]}
          >
            {item.journal.pageCount}{" "}
            {item.journal.pageCount === 1 ? "page" : "pages"} ·{" "}
            {formatDate(item.journal.createdAt)}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

// ── Main screen ──────────────────────────────────────────────

export default function LibraryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: rawW } = useWindowDimensions();

  const effectiveW =
    Platform.OS === "web" ? Math.min(rawW, MAX_CONTENT_W) : rawW;
  const cardW = (effectiveW - H_PAD * 2 - COL_GAP) / 2;
  const cardH = cardW * 1.42;

  const [journals, setJournals] = useState<JournalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  // Context menu bottom sheet
  const [menuJournal, setMenuJournal] = useState<JournalItem | null>(null);
  const [editTitleText, setEditTitleText] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [savingAction, setSavingAction] = useState(false);

  // S2: Inbox overlay
  const [inboxVisible, setInboxVisible] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userInitial, setUserInitial] = useState("?");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const email = session?.user?.email ?? "";
      setUserInitial(email[0]?.toUpperCase() ?? "?");
    });
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("read", false);
    setUnreadCount(count ?? 0);
  }, []);

  const pt = Platform.OS === "web" ? 67 : insets.top;
  const pb =
    Platform.OS === "web" ? 34 + TAB_BAR_H : insets.bottom + TAB_BAR_H;

  // ── Data fetching ──────────────────────────────────────────

  const fetchJournals = useCallback(async () => {
    try {
      // O2: Single RPC replaces two round trips (journals select + pending counts)
      const { data: rawData, error } = await supabase.rpc("get_journals_with_counts");
      if (error) throw error;

      const rows = (rawData ?? []) as JournalsWithCountsRow[];

      // Generate signed URLs for image covers in one batch call
      const imagePaths = rows
        .filter((r) => r.cover_style === "image" && r.cover_image_url)
        .map((r) => r.cover_image_url!);

      let signedUrlMap: Record<string, string> = {};
      if (imagePaths.length > 0) {
        const { data: signed } = await supabase.storage
          .from("covers")
          .createSignedUrls(imagePaths, 3600);
        signedUrlMap = Object.fromEntries(
          (signed ?? []).map((s) => [s.path, s.signedUrl])
        );
      }

      const mapped: JournalItem[] = rows.map((r) => ({
        id: r.id,
        title: r.title,
        coverStyle: r.cover_style as "solid" | "image",
        coverColor: r.cover_color ?? undefined,
        coverImage:
          r.cover_style === "image" && r.cover_image_url
            ? signedUrlMap[r.cover_image_url]
            : undefined,
        coverImagePath: r.cover_image_url ?? undefined,
        pageCount: r.page_count ?? 0,
        createdAt: r.created_at,
        isPrivate: r.is_private ?? false,
        pendingCount: r.pending_count ?? 0,
      }));

      setJournals(mapped);
    } catch (err) {
      console.error("[Library] fetchJournals error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchJournals();
      fetchUnreadCount();
    }, [fetchJournals, fetchUnreadCount])
  );

  // ── Realtime: update pending counts when a transcription finishes ──────────

  // Keep journal IDs in a ref so the Realtime callback doesn't need journals
  // in its closure (avoids recreating the channel on every journals update).
  const journalIdsRef = useRef<string[]>([]);
  useEffect(() => {
    journalIdsRef.current = journals.map((j) => j.id);
  }, [journals]);

  useEffect(() => {
    const channelName = "library-transcription-updates";
    supabase
      .getChannels()
      .filter((ch) => ch.topic === `realtime:${channelName}`)
      .forEach((ch) => supabase.removeChannel(ch));

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pages" },
        async (payload) => {
          const row = payload.new as { journal_id: string; transcription_status: string };
          if (
            (row.transcription_status === "done" || row.transcription_status === "failed") &&
            journalIdsRef.current.includes(row.journal_id)
          ) {
            // Re-fetch counts for all known journals
            const { data: counts } = await supabase.rpc("journal_pending_counts", {
              p_journal_ids: journalIdsRef.current,
            });
            if (counts) {
              const countMap = Object.fromEntries(
                (counts as { journal_id: string; pending_count: number }[]).map(
                  (r) => [r.journal_id, r.pending_count]
                )
              );
              setJournals((prev) =>
                prev.map((j) => ({ ...j, pendingCount: countMap[j.id] ?? 0 }))
              );
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // channel created once; journal list updates via journalIdsRef

  // ── Filtering ──────────────────────────────────────────────

  const filtered = useMemo(
    () =>
      searchText.trim()
        ? journals.filter((j) =>
            j.title.toLowerCase().includes(searchText.toLowerCase())
          )
        : journals,
    [journals, searchText]
  );

  const isEmpty = !loading && filtered.length === 0;

  const gridData: GridItem[] = useMemo(
    () => [
      { type: "new" },
      ...filtered.map((j) => ({ type: "journal" as const, journal: j })),
    ],
    [filtered]
  );

  // ── Render helpers ─────────────────────────────────────────

  const handleMenuPress = useCallback((journal: JournalItem) => {
    setMenuJournal(journal);
    setEditTitleText(journal.title);
    setEditingTitle(false);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: GridItem }) => (
      <LibraryGridItem
        item={item}
        cardW={cardW}
        cardH={cardH}
        colors={colors}
        onMenuPress={handleMenuPress}
      />
    ),
    [cardW, cardH, colors, handleMenuPress]
  );

  // ── Context menu actions ──────────────────────────────────────

  const closeMenu = useCallback(() => setMenuJournal(null), []);

  // Save a new title
  const handleSaveTitle = useCallback(async () => {
    if (!menuJournal) return;
    const trimmed = editTitleText.trim();
    if (!trimmed || trimmed === menuJournal.title) { closeMenu(); return; }
    setSavingAction(true);
    await supabase.from("journals").update({ title: trimmed }).eq("id", menuJournal.id);
    setJournals((prev) => prev.map((j) => j.id === menuJournal.id ? { ...j, title: trimmed } : j));
    setSavingAction(false);
    closeMenu();
  }, [menuJournal, editTitleText, closeMenu]);

  // Change cover color
  const COVER_COLORS = ["#c8b89a", "#a8b8a0", "#b8b0c8", "#b8c4b0", "#c0a898", "#a8b0b8"];
  const handleChangeCoverColor = useCallback(async (hex: string) => {
    if (!menuJournal) return;
    await supabase.from("journals").update({ cover_style: "solid", cover_color: hex }).eq("id", menuJournal.id);
    setJournals((prev) => prev.map((j) => j.id === menuJournal.id ? { ...j, coverStyle: "solid", coverColor: hex } : j));
    closeMenu();
  }, [menuJournal, closeMenu]);

  // Change date
  const handleChangeDate = useCallback(() => {
    if (!menuJournal) return;
    const current = menuJournal.createdAt.slice(0, 10);
    Alert.prompt(
      "Change date",
      "Enter the date in YYYY-MM-DD format (e.g. 2023-06-15).",
      async (input) => {
        if (!input) return;
        const parsed = new Date(input);
        if (isNaN(parsed.getTime())) {
          Alert.alert("Invalid date", "Please use YYYY-MM-DD format.");
          return;
        }
        const iso = parsed.toISOString();
        await supabase.from("journals").update({ created_at: iso }).eq("id", menuJournal.id);
        setJournals((prev) => prev.map((j) => j.id === menuJournal.id ? { ...j, createdAt: iso } : j));
        closeMenu();
      },
      "plain-text",
      current
    );
  }, [menuJournal, closeMenu]);

  // Toggle lock
  const handleToggleLock = useCallback(async () => {
    if (!menuJournal) return;
    const newValue = !menuJournal.isPrivate;
    await supabase.from("journals").update({ is_private: newValue }).eq("id", menuJournal.id);
    setJournals((prev) => prev.map((j) => j.id === menuJournal.id ? { ...j, isPrivate: newValue } : j));
    closeMenu();
  }, [menuJournal, closeMenu]);

  // Soft delete
  const handleDeleteJournal = useCallback(() => {
    if (!menuJournal) return;
    Alert.alert(
      "Move to Recently Deleted?",
      `"${menuJournal.title}" will be kept for 30 days, then permanently deleted. You can restore it from Profile → Deleted Journals.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await supabase
              .from("journals")
              .update({ deleted_at: new Date().toISOString() })
              .eq("id", menuJournal.id);
            setJournals((prev) => prev.filter((j) => j.id !== menuJournal.id));
            closeMenu();
          },
        },
      ]
    );
  }, [menuJournal, closeMenu]);

  // Export
  const handleExportJournal = useCallback(async () => {
    if (!menuJournal) return;
    closeMenu();
    const { data: pages } = await supabase
      .from("pages")
      .select("page_number, transcription_text")
      .eq("journal_id", menuJournal.id)
      .is("deleted_at", null)
      .order("page_number");
    if (!pages || pages.length === 0) {
      Alert.alert("Nothing to export", "This journal has no transcribed pages.");
      return;
    }
    const text = (pages as { page_number: number; transcription_text: string | null }[])
      .map((p) => `--- Page ${p.page_number} ---\n${p.transcription_text ?? "(no transcription)"}`)
      .join("\n\n");
    const FileSystem = await import("expo-file-system/legacy");
    const path = `${FileSystem.cacheDirectory}${menuJournal.title.replace(/[^a-z0-9]/gi, "_")}.txt`;
    await FileSystem.writeAsStringAsync(path, text, { encoding: FileSystem.EncodingType.UTF8 });
    const Sharing = await import("expo-sharing");
    await Sharing.shareAsync(path, { mimeType: "text/plain", UTI: "public.plain-text" });
  }, [menuJournal, closeMenu]);

  // ── Header ─────────────────────────────────────────────────

  const ListHeader = (
    <View>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: pt + 8 }]}>
        <Text
          style={[
            styles.topWordmark,
            {
              color: colors.foreground,
              fontFamily: "PlayfairDisplay_700Bold",
            },
          ]}
        >
          Margin
        </Text>
        <View style={styles.topActions}>
          <TouchableOpacity
            style={[styles.avatar, { backgroundColor: colors.primary }]}
            onPress={() => {
              Haptics.selectionAsync();
              setInboxVisible(true);
            }}
          >
            <Text
              style={[styles.avatarInitial, { fontFamily: "Inter_600SemiBold" }]}
            >
              {userInitial}
            </Text>
            {unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.destructive }]}>
                <Text style={styles.badgeText}>
                  {unreadCount > 9 ? "9+" : String(unreadCount)}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Greeting */}
      <View style={styles.greetingWrap}>
        <Text
          style={[
            styles.greeting,
            { color: colors.foreground, fontFamily: "PlayfairDisplay_700Bold" },
          ]}
        >
          Your shelf
        </Text>
        <Text
          style={[
            styles.greetingSub,
            { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
          ]}
        >
          {loading
            ? "Loading…"
            : journals.length === 0
              ? "No journals yet"
              : `${journals.length} journal${journals.length === 1 ? "" : "s"}`}
        </Text>
      </View>

      {/* Search bar */}
      <View
        style={[
          styles.searchBar,
          {
            backgroundColor: colors.card,
            borderColor: searchFocused ? colors.primary : colors.border,
          },
        ]}
      >
        <Feather
          name="search"
          size={17}
          color={searchFocused ? colors.primary : colors.mutedForeground}
        />
        <TextInput
          style={[
            styles.searchInput,
            { color: colors.foreground, fontFamily: "Inter_400Regular" },
          ]}
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search your journals…"
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="search"
          clearButtonMode="while-editing"
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />
      </View>

      {!isEmpty && !loading && (
        <Text
          style={[
            styles.sectionLabel,
            { color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
          ]}
        >
          All journals
        </Text>
      )}
    </View>
  );

  // ── Loading skeleton ────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <InboxOverlay
          visible={inboxVisible}
          onClose={() => setInboxVisible(false)}
          onNotificationsRead={() => setUnreadCount(0)}
        />
        {ListHeader}
        <View style={[styles.gridContent, styles.skeletonGrid]}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} cardW={cardW} cardH={cardH} />
          ))}
        </View>
      </View>
    );
  }

  // ── Empty state ─────────────────────────────────────────────

  if (isEmpty && !searchText) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <InboxOverlay
          visible={inboxVisible}
          onClose={() => setInboxVisible(false)}
          onNotificationsRead={() => setUnreadCount(0)}
        />
        {ListHeader}
        <EmptyState />
      </View>
    );
  }

  // ── Grid ────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <InboxOverlay
        visible={inboxVisible}
        onClose={() => setInboxVisible(false)}
        onNotificationsRead={() => setUnreadCount(0)}
      />
      <FlatList
        data={gridData}
        keyExtractor={(item) =>
          item.type === "new" ? "new" : item.journal.id
        }
        renderItem={renderItem}
        numColumns={2}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={[styles.gridContent, { paddingBottom: pb }]}
        columnWrapperStyle={styles.columnWrapper}
        showsVerticalScrollIndicator={false}
      />
      
      {/* ── Journal context menu bottom sheet ── */}
      <Modal
        visible={menuJournal !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeMenu}
      >
        {menuJournal && (
          <View style={[styles.sheetRoot, { backgroundColor: colors.background }]}>
            {/* Handle bar */}
            <View style={styles.sheetHandle}>
              <View style={[styles.sheetHandleBar, { backgroundColor: colors.border }]} />
            </View>

            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.foreground, fontFamily: "PlayfairDisplay_700Bold" }]}
                numberOfLines={1}
              >
                {menuJournal.title}
              </Text>
              <TouchableOpacity onPress={closeMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* ── Edit title ── */}
            {editingTitle ? (
              <View style={styles.sheetTitleEdit}>
                <TextInput
                  value={editTitleText}
                  onChangeText={setEditTitleText}
                  autoFocus
                  style={[
                    styles.sheetTitleInput,
                    { color: colors.foreground, borderColor: colors.primary, fontFamily: "Inter_400Regular" },
                  ]}
                  returnKeyType="done"
                  onSubmitEditing={handleSaveTitle}
                />
                <TouchableOpacity
                  onPress={handleSaveTitle}
                  disabled={savingAction}
                  style={[styles.sheetSaveBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Save</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => setEditingTitle(true)}
              >
                <Feather name="edit-2" size={18} color={colors.primary} />
                <Text style={[styles.sheetRowLabel, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                  Edit title
                </Text>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}

            <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />

            {/* ── Change cover color ── */}
            <View style={styles.sheetRow}>
              <Feather name="droplet" size={18} color={colors.primary} />
              <Text style={[styles.sheetRowLabel, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                Cover color
              </Text>
              <View style={styles.sheetSwatchRow}>
                {COVER_COLORS.map((hex) => (
                  <TouchableOpacity
                    key={hex}
                    style={[
                      styles.sheetSwatch,
                      { backgroundColor: hex },
                      menuJournal.coverColor === hex && {
                        borderWidth: 2.5,
                        borderColor: colors.primary,
                      },
                    ]}
                    onPress={() => handleChangeCoverColor(hex)}
                  />
                ))}
              </View>
            </View>

            <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />

            {/* ── Change date ── */}
            <TouchableOpacity style={styles.sheetRow} onPress={handleChangeDate}>
              <Feather name="calendar" size={18} color={colors.primary} />
              <Text style={[styles.sheetRowLabel, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                Change date
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 }}>
                {formatDate(menuJournal.createdAt)}
              </Text>
            </TouchableOpacity>

            <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />

            {/* ── Lock / Unlock ── */}
            <TouchableOpacity style={styles.sheetRow} onPress={handleToggleLock}>
              <Feather name={menuJournal.isPrivate ? "unlock" : "lock"} size={18} color={colors.primary} />
              <Text style={[styles.sheetRowLabel, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                {menuJournal.isPrivate ? "Unlock journal" : "Lock journal"}
              </Text>
            </TouchableOpacity>

            <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />

            {/* ── Export ── */}
            <TouchableOpacity style={styles.sheetRow} onPress={handleExportJournal}>
              <Feather name="share" size={18} color={colors.primary} />
              <Text style={[styles.sheetRowLabel, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                Export journal
              </Text>
            </TouchableOpacity>

            <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />

            {/* ── Delete (destructive) ── */}
            <TouchableOpacity style={styles.sheetRow} onPress={handleDeleteJournal}>
              <Feather name="trash-2" size={18} color={colors.destructive} />
              <Text style={[styles.sheetRowLabel, { color: colors.destructive, fontFamily: "Inter_400Regular" }]}>
                Delete journal
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: H_PAD,
    paddingBottom: 12,
  },
  topWordmark: { fontSize: 22, letterSpacing: -0.3 },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 15 },
  badge: {
    position: "absolute",
    top: -3,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" },

  greetingWrap: {
    paddingHorizontal: H_PAD,
    paddingBottom: 16,
  },
  greeting: { fontSize: 30, letterSpacing: -0.5, lineHeight: 34 },
  greetingSub: { fontSize: 14, marginTop: 3, opacity: 0.75 },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: H_PAD,
    marginBottom: 20,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 15, height: 48 },

  sectionLabel: {
    paddingHorizontal: H_PAD,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 14,
  },

  gridContent: { paddingHorizontal: H_PAD },
  columnWrapper: { justifyContent: "space-between", marginBottom: 0 },
  skeletonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },

  coverOuter: {
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    shadowColor: "#4a3f35",
    shadowOffset: { width: 2, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  spine: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: SPINE_W,
    backgroundColor: "rgba(0,0,0,0.18)",
    zIndex: 2,
  },
  imageScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(30,20,10,0.35)",
    zIndex: 1,
  },
  coverTitleWrap: {
    position: "absolute",
    right: 10,
    bottom: 14,
    zIndex: 3,
  },
  coverTitle: {
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 0.1,
  },

  lockBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  pendingBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    zIndex: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },

  newTile: {
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  newIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  newTileText: { fontSize: 13 },

  journalName: { fontSize: 13, marginTop: 8, marginLeft: 2 },
  journalMeta: { fontSize: 11, marginTop: 2, marginLeft: 2, opacity: 0.8 },

  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingBottom: 80,
    gap: 12,
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 22,
    letterSpacing: -0.3,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    opacity: 0.8,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  emptyBtnText: { color: "#fff", fontSize: 15 },
  menuDotBtn: {
    position: "absolute",
    bottom: 8,
    right: 8,
    zIndex: 5,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.40)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetRoot: {
    flex: 1,
    paddingTop: 8,
  },
  sheetHandle: {
    alignItems: "center",
    paddingVertical: 10,
  },
  sheetHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  sheetTitle: {
    fontSize: 20,
    letterSpacing: -0.3,
    flex: 1,
    marginRight: 12,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  sheetRowLabel: {
    flex: 1,
    fontSize: 16,
  },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 52,
  },
  sheetSwatchRow: {
    flexDirection: "row",
    gap: 8,
  },
  sheetSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  sheetTitleEdit: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 10,
  },
  sheetTitleInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  sheetSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
});
