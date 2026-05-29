import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
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

const H_PAD = 20;
const COL_GAP = 12;
const SPINE_W = 9;
const TAB_BAR_H = 84;
const MAX_CONTENT_W = 430;

type CoverStyle = "solid" | "image";

interface Journal {
  id: string;
  title: string;
  coverStyle: CoverStyle;
  coverColor?: string;
  coverImage?: string;
  pageCount: number;
  lastEdited: string;
}

const MOCK_JOURNALS: Journal[] = [
  {
    id: "1",
    title: "Morning Pages",
    coverStyle: "solid",
    coverColor: "#c8b89a",
    pageCount: 127,
    lastEdited: "2h ago",
  },
  {
    id: "2",
    title: "Travel 2019",
    coverStyle: "image",
    coverImage: "https://picsum.photos/seed/travel2019/200/285",
    pageCount: 64,
    lastEdited: "3d ago",
  },
  {
    id: "3",
    title: "Dream Journal",
    coverStyle: "solid",
    coverColor: "#b8b0c8",
    pageCount: 42,
    lastEdited: "1w ago",
  },
  {
    id: "4",
    title: "Work Notes",
    coverStyle: "solid",
    coverColor: "#a8b8a0",
    pageCount: 89,
    lastEdited: "yesterday",
  },
  {
    id: "5",
    title: "Letters to Mom",
    coverStyle: "image",
    coverImage: "https://picsum.photos/seed/vintage43/200/285",
    pageCount: 18,
    lastEdited: "2w ago",
  },
  {
    id: "6",
    title: "Reading Notes",
    coverStyle: "solid",
    coverColor: "#b8a898",
    pageCount: 31,
    lastEdited: "5d ago",
  },
];

type GridItem = { type: "new" } | { type: "journal"; journal: Journal };

interface CardDims {
  cardW: number;
  cardH: number;
}

function JournalCover({
  journal,
  cardW,
  cardH,
}: { journal: Journal } & CardDims) {
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
        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
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

export default function LibraryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: rawW } = useWindowDimensions();

  // On web the window can be very wide; cap to mobile-width content
  const effectiveW =
    Platform.OS === "web" ? Math.min(rawW, MAX_CONTENT_W) : rawW;
  const cardW = (effectiveW - H_PAD * 2 - COL_GAP) / 2;
  const cardH = cardW * 1.42;

  const [journals, setJournals] = useState<Journal[]>(MOCK_JOURNALS);
  const [searchText, setSearchText] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const pt = Platform.OS === "web" ? 67 : insets.top;
  const pb =
    Platform.OS === "web" ? 34 + TAB_BAR_H : insets.bottom + TAB_BAR_H;

  const gridData: GridItem[] = [
    { type: "new" },
    ...journals.map((j) => ({ type: "journal" as const, journal: j })),
  ];

  const isEmpty = journals.length === 0;

  function renderItem({ item }: { item: GridItem }) {
    return (
      <View style={{ marginBottom: COL_GAP }}>
        {item.type === "new" ? (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              console.log("New journal tapped");
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
              {item.journal.pageCount} pages · {item.journal.lastEdited}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

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
          {/* Avatar */}
          <TouchableOpacity
            style={[styles.avatar, { backgroundColor: colors.primary }]}
            onPress={() => {
              Haptics.selectionAsync();
              console.log("Profile tapped");
            }}
          >
            <Text
              style={[
                styles.avatarInitial,
                { fontFamily: "Inter_600SemiBold" },
              ]}
            >
              S
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Greeting */}
      <View style={styles.greetingWrap}>
        <Text
          style={[
            styles.greeting,
            {
              color: colors.foreground,
              fontFamily: "PlayfairDisplay_700Bold",
            },
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
          {journals.length === 0
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

      {!isEmpty && (
        <Text
          style={[
            styles.sectionLabel,
            {
              color: colors.mutedForeground,
              fontFamily: "Inter_500Medium",
            },
          ]}
        >
          All journals
        </Text>
      )}
    </View>
  );

  if (isEmpty) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {ListHeader}
        <EmptyState />
      </View>
    );
  }

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
        contentContainerStyle={[
          styles.gridContent,
          { paddingBottom: pb },
        ]}
        columnWrapperStyle={styles.columnWrapper}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

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
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
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

  coverOuter: {
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    // Native shadows
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
