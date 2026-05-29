import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const H_PAD = 20;
const MAX_CONTENT_W = 430;

interface JournalPage {
  id: string;
  text: string;
  hasReviewItems?: boolean;
  reviewCount?: number;
}

const SAMPLE_PAGES: JournalPage[] = [
  {
    id: "p1",
    text: `March 3rd

The frost was still on the windows when I sat down this morning. There is something about the quiet of these early hours that I have come to depend on — the house asleep, the kettle ticking as it cools, the page open and waiting.

I keep returning to the same thought: that the small rituals are the ones that hold a life together. Not the grand resolutions, but the cup of tea at dawn, the walk along the river, the few lines set down before the day takes hold.

Today I will try to remember that.`,
    hasReviewItems: true,
    reviewCount: 3,
  },
  {
    id: "p2",
    text: `March 7th

A long entry today, because so much has happened and I do not want to lose any of it.

We drove out to the coast before sunrise. The road was empty and the fields on either side were silver with dew, and for the first hour neither of us spoke — there was no need. When we reached the headland the tide was far out, and the whole bay lay open like a held breath.

We walked until the sand turned to shingle and our shoes were soaked through. I found a piece of sea glass, worn soft and green, and slipped it into my pocket like a small secret. Later we sat against the rocks and ate the bread and cheese we had packed, and watched the gulls wheel and cry above the water.

I keep thinking about how rare it is to feel time slow down like that. So much of ordinary life is spent rushing from one thing to the next, measuring the days in tasks completed and errands run. But out there, with the wind in our faces and nothing to do but be present, the hours seemed to widen and deepen.

On the drive home we stopped at a roadside stand and bought a basket of early strawberries. They were small and almost too sweet, still warm from the sun, and we ate them straight from the punnet with stained fingers and no shame at all.

I want to hold onto this feeling — the salt still in my hair, the quiet contentment, the sense that the day was lived fully rather than merely got through. Tomorrow the ordinary will return, the lists and the deadlines, but tonight I am grateful beyond measure.`,
  },
  {
    id: "p3",
    text: `March 12th

A grey, drizzling day. I stayed in and read most of the afternoon, wrapped in the old wool blanket by the window.

There is a particular pleasure in a rainy day with nowhere to be — the world outside softened and blurred, the lamp warm against the gloom. I made soup from whatever was left in the cupboard and it turned out far better than it had any right to.

Some days ask nothing of you but to be passed gently. Today was one of those.`,
  },
  {
    id: "p4",
    text: `March 18th

I have been thinking about beginnings lately — how every blank page is a small invitation, a quiet promise that something might yet be made.

When I started keeping this journal I worried I would have nothing to say. Now I find the opposite is true: the more I write, the more I notice, and the more I notice, the more there is to set down.

Perhaps that is the whole point. Not to record a life already lived, but to live more attentively for the sake of the record.`,
  },
];

type ContentView = "transcription" | "original";

export default function JournalReaderScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: rawW } = useWindowDimensions();
  const params = useLocalSearchParams<{ id: string; title?: string }>();

  const title = params.title ?? "Journal";

  const effectiveW =
    Platform.OS === "web" ? Math.min(rawW, MAX_CONTENT_W) : rawW;

  const [currentPage, setCurrentPage] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [contentView, setContentView] = useState<ContentView>("transcription");
  const [pages, setPages] = useState<JournalPage[]>(SAMPLE_PAGES);

  const scrollRef = useRef<ScrollView>(null);
  const totalPages = pages.length;

  const goToPage = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(totalPages - 1, index));
      if (clamped === currentPage) return;
      Haptics.selectionAsync();
      setCurrentPage(clamped);
      setContentView("transcription");
      scrollRef.current?.scrollTo({ x: clamped * effectiveW, animated: true });
    },
    [currentPage, totalPages, effectiveW],
  );

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / effectiveW);
      if (index !== currentPage) {
        setCurrentPage(index);
        setContentView("transcription");
      }
    },
    [currentPage, effectiveW],
  );

  const handleKeyDown = useCallback(
    (e: { nativeEvent?: { key?: string } }) => {
      const key = e?.nativeEvent?.key;
      if (key === "ArrowRight") goToPage(currentPage + 1);
      else if (key === "ArrowLeft") goToPage(currentPage - 1);
    },
    [currentPage, goToPage],
  );

  const updatePageText = useCallback(
    (text: string) => {
      setPages((prev) =>
        prev.map((p, i) => (i === currentPage ? { ...p, text } : p)),
      );
    },
    [currentPage],
  );

  const pt = Platform.OS === "web" ? 20 : insets.top;
  const pb = Platform.OS === "web" ? 24 : insets.bottom;

  const isFirst = currentPage === 0;
  const isLast = currentPage === totalPages - 1;

  const webKeyProps =
    Platform.OS === "web"
      ? ({ onKeyDown: handleKeyDown, tabIndex: 0 } as object)
      : {};

  return (
    <View
      style={[styles.root, { backgroundColor: colors.background, paddingTop: pt }]}
      accessibilityLabel={`Reader for ${title}`}
      {...webKeyProps}
    >
      <View style={styles.centerWrap}>
        <View style={[styles.contentColumn, { maxWidth: MAX_CONTENT_W }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => {
                Haptics.selectionAsync();
                router.back();
              }}
              accessibilityRole="button"
              accessibilityLabel="Go back to library"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="arrow-left" size={24} color={colors.foreground} />
            </TouchableOpacity>

            <Text
              style={[
                styles.headerTitle,
                {
                  color: colors.foreground,
                  fontFamily: "PlayfairDisplay_600SemiBold",
                },
              ]}
              numberOfLines={1}
              accessibilityRole="header"
            >
              {title}
            </Text>

            <View style={styles.editToggle}>
              <Text
                style={[
                  styles.editLabel,
                  {
                    color: editMode ? colors.primary : colors.mutedForeground,
                    fontFamily: "Inter_500Medium",
                  },
                ]}
              >
                {editMode ? "Done" : "Edit"}
              </Text>
              <Switch
                value={editMode}
                onValueChange={(v) => {
                  Haptics.selectionAsync();
                  setEditMode(v);
                }}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.border}
                accessibilityLabel="Toggle edit mode"
              />
            </View>
          </View>

          {/* Page counter */}
          <Text
            style={[
              styles.pageCounter,
              {
                color: colors.mutedForeground,
                fontFamily: "Inter_400Regular",
              },
            ]}
            accessibilityLabel={`Page ${currentPage + 1} of ${totalPages}`}
          >
            Page {currentPage + 1} of {totalPages}
          </Text>

          {/* Transcription | Original toggle (read mode only) */}
          {!editMode && (
            <View style={styles.segmentRow}>
              {(["transcription", "original"] as ContentView[]).map((view) => {
                const active = contentView === view;
                const label =
                  view === "transcription" ? "Transcription" : "Original";
                return (
                  <TouchableOpacity
                    key={view}
                    style={styles.segmentBtn}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setContentView(view);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Show ${label.toLowerCase()} view`}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        {
                          color: active
                            ? colors.foreground
                            : colors.mutedForeground,
                          fontFamily: active
                            ? "Inter_600SemiBold"
                            : "Inter_400Regular",
                        },
                      ]}
                    >
                      {label}
                    </Text>
                    <View
                      style={[
                        styles.segmentUnderline,
                        {
                          backgroundColor: active
                            ? colors.primary
                            : "transparent",
                        },
                      ]}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </View>

      {/* Pages */}
      <View style={styles.pagesArea}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          scrollEnabled={!editMode}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumScrollEnd}
          scrollEventThrottle={16}
        >
          {pages.map((page, index) => (
            <View key={page.id} style={{ width: effectiveW }}>
              <View style={styles.pageCenter}>
                <View
                  style={[styles.pageColumn, { maxWidth: MAX_CONTENT_W }]}
                >
                  {!editMode && contentView === "original" ? (
                    <ScrollView
                      contentContainerStyle={styles.scrollPad}
                      showsVerticalScrollIndicator={false}
                    >
                      <Image
                        source={{
                          uri: `https://picsum.photos/seed/page-${page.id}/600/860`,
                        }}
                        style={[
                          styles.originalImage,
                          { borderColor: colors.border },
                        ]}
                        resizeMode="cover"
                        accessibilityLabel={`Original handwritten photo of page ${
                          index + 1
                        } (placeholder)`}
                      />
                    </ScrollView>
                  ) : editMode ? (
                    <ScrollView
                      contentContainerStyle={styles.scrollPad}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                    >
                      <TextInput
                        style={[
                          styles.pageText,
                          styles.pageInput,
                          {
                            color: "#4a3f35",
                            backgroundColor: "#faf7f2",
                            fontFamily: "PlayfairDisplay_400Regular",
                          },
                        ]}
                        value={page.text}
                        onChangeText={updatePageText}
                        multiline
                        textAlignVertical="top"
                        accessibilityLabel={`Edit text for page ${index + 1}`}
                      />
                    </ScrollView>
                  ) : (
                    <ScrollView
                      contentContainerStyle={styles.scrollPad}
                      showsVerticalScrollIndicator={false}
                    >
                      {page.hasReviewItems ? (
                        <TouchableOpacity
                          style={[
                            styles.reviewBadge,
                            { backgroundColor: colors.primary },
                          ]}
                          onPress={() => {
                            Haptics.selectionAsync();
                            console.log(
                              `Review badge tapped on page ${index + 1}`,
                            );
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`${
                            page.reviewCount ?? 0
                          } items to review on this page`}
                        >
                          <Feather name="edit-3" size={12} color="#fff" />
                          <Text
                            style={[
                              styles.reviewBadgeText,
                              { fontFamily: "Inter_600SemiBold" },
                            ]}
                          >
                            {page.reviewCount ?? 0} to review
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      <Text
                        style={[
                          styles.pageText,
                          {
                            color: "#4a3f35",
                            fontFamily: "PlayfairDisplay_400Regular",
                          },
                        ]}
                        accessibilityLabel={`Transcription of page ${
                          index + 1
                        }`}
                      >
                        {page.text}
                      </Text>
                    </ScrollView>
                  )}
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Footer controls */}
      <View
        style={[
          styles.footer,
          { paddingBottom: pb + 8, borderTopColor: colors.border },
        ]}
      >
        <TouchableOpacity
          style={[styles.chevronBtn, isFirst && styles.chevronDisabled]}
          onPress={() => goToPage(currentPage - 1)}
          disabled={isFirst}
          accessibilityRole="button"
          accessibilityLabel="Previous page"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather
            name="chevron-left"
            size={26}
            color={isFirst ? colors.border : colors.foreground}
          />
        </TouchableOpacity>

        <View style={styles.dotsRow}>
          {pages.map((p, i) => (
            <View
              key={p.id}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    i === currentPage ? colors.primary : colors.border,
                  width: i === currentPage ? 18 : 7,
                },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.chevronBtn, isLast && styles.chevronDisabled]}
          onPress={() => goToPage(currentPage + 1)}
          disabled={isLast}
          accessibilityRole="button"
          accessibilityLabel="Next page"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather
            name="chevron-right"
            size={26}
            color={isLast ? colors.border : colors.foreground}
          />
        </TouchableOpacity>
      </View>

      {/* Floating add-page FAB (edit mode only) */}
      {editMode && (
        <TouchableOpacity
          style={[
            styles.fab,
            {
              backgroundColor: colors.primary,
              bottom: pb + 80,
            },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            console.log("Add page from photo");
          }}
          accessibilityRole="button"
          accessibilityLabel="Add page from photo"
          activeOpacity={0.85}
        >
          <Feather name="camera" size={24} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centerWrap: { alignItems: "center" },
  contentColumn: { width: "100%", paddingHorizontal: H_PAD },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 48,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    letterSpacing: -0.3,
    textAlign: "center",
  },
  editToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  editLabel: { fontSize: 13 },

  pageCounter: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 4,
    letterSpacing: 0.3,
  },

  segmentRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 28,
    marginTop: 14,
  },
  segmentBtn: { alignItems: "center" },
  segmentText: { fontSize: 14, letterSpacing: 0.2, paddingBottom: 6 },
  segmentUnderline: {
    height: 2,
    width: "100%",
    borderRadius: 1,
  },

  pagesArea: { flex: 1, marginTop: 12 },
  pageCenter: { flex: 1, alignItems: "center" },
  pageColumn: { flex: 1, width: "100%", paddingHorizontal: H_PAD },
  scrollPad: { paddingVertical: 18, paddingBottom: 40 },

  pageText: {
    fontSize: 18,
    lineHeight: 32,
    letterSpacing: 0.1,
  },
  pageInput: {
    minHeight: 400,
    borderRadius: 8,
    padding: 4,
  },

  originalImage: {
    width: "100%",
    aspectRatio: 0.7,
    borderRadius: 10,
    borderWidth: 1,
  },

  reviewBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 14,
    marginBottom: 16,
  },
  reviewBadgeText: { color: "#fff", fontSize: 12, letterSpacing: 0.2 },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: H_PAD,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  chevronBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  chevronDisabled: { opacity: 0.5 },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },

  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4a3f35",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
});
