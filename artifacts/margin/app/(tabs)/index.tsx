import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
}

type JournalRow = Database["public"]["Tables"]["journals"]["Row"] & {
  pages: Array<{ count: number }>;
};

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

  const pt = Platform.OS === "web" ? 67 : insets.top;
  const pb =
    Platform.OS === "web" ? 34 + TAB_BAR_H : insets.bottom + TAB_BAR_H;

  // ── Data fetching ──────────────────────────────────────────

  const fetchJournals = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const { data: rawData, error } = await supabase
        .from("journals")
        .select("*, pages(count)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (rawData ?? []) as unknown as JournalRow[];

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
        coverStyle: r.cover_style,
        coverColor: r.cover_color ?? undefined,
        coverImage:
          r.cover_style === "image" && r.cover_image_url
            ? signedUrlMap[r.cover_image_url]
            : undefined,
        coverImagePath: r.cover_image_url ?? undefined,
        pageCount: r.pages?.[0]?.count ?? 0,
        createdAt: r.created_at,
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
    }, [fetchJournals])
  );

  // ── Filtering ──────────────────────────────────────────────

  const filtered = searchText.trim()
    ? journals.filter((j) =>
        j.title.toLowerCase().includes(searchText.toLowerCase())
      )
    : journals;

  const isEmpty = !loading && filtered.length === 0;

  const gridData: GridItem[] = [
    { type: "new" },
    ...filtered.map((j) => ({ type: "journal" as const, journal: j })),
  ];

  // ── Render helpers ─────────────────────────────────────────

  function renderItem({ item }: { item: GridItem }) {
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
                },
              });
            }}
            activeOpacity={0.82}
          >
            <JournalCover
              journal={item.journal}
              cardW={cardW}
              cardH={cardH}
            />
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
  }

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
            onPress={() => Haptics.selectionAsync()}
          >
            <Text
              style={[styles.avatarInitial, { fontFamily: "Inter_600SemiBold" }]}
            >
              M
            </Text>
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
        {ListHeader}
        <EmptyState />
      </View>
    );
  }

  // ── Grid ────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
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
});
