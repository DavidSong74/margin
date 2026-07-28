import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
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
import { supabase } from "@/lib/supabase";
import type { PendingCorrection } from "@/lib/database.types";

const H_PAD = 20;
const MAX_CONTENT_W = 430;

// ── Types ─────────────────────────────────────────────────────

interface JournalPage {
  id: string;
  pageNumber: number;
  imagePath: string;
  signedImageUrl: string | null;
  transcriptionText: string | null;
  transcriptionStatus: "pending" | "processing" | "done" | "failed";
  pendingCorrections: PendingCorrection[];
  correctionCount: number;
}

type ContentView = "transcription" | "original";

type CorrDecision =
  | { kind: "skipped" }
  | { kind: "saved"; corrected: string };

// ── Screen ─────────────────────────────────────────────────────

export default function JournalReaderScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: rawW } = useWindowDimensions();
  const params = useLocalSearchParams<{ id: string; title?: string; initial_page?: string }>();

  const journalId = params.id;
  const title = params.title ?? "Journal";
  const initialPage = params.initial_page ? Math.max(0, parseInt(params.initial_page, 10) - 1) : 0;

  const effectiveW =
    Platform.OS === "web" ? Math.min(rawW, MAX_CONTENT_W) : rawW;

  // ── Page data ────────────────────────────────────────────────
  const [pages, setPages] = useState<JournalPage[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Reader state ─────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [contentView, setContentView] = useState<ContentView>("transcription");

  // ── Correction modal state ───────────────────────────────────
  const [corrModalPageIdx, setCorrModalPageIdx] = useState<number | null>(null);
  const [corrModalCorrIdx, setCorrModalCorrIdx] = useState(0);
  const [corrEditText, setCorrEditText] = useState("");
  const [corrSaving, setCorrSaving] = useState(false);
  const corrDecisions = useRef<CorrDecision[]>([]);

  const scrollRef = useRef<ScrollView>(null);
  const totalPages = pages.length;

  // ── Fetch pages ──────────────────────────────────────────────

  const fetchPages = useCallback(async () => {
    if (!journalId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pages")
        .select(
          "id, page_number, image_path, thumbnail_path, transcription_text, transcription_status, pending_corrections, correction_count"
        )
        .eq("journal_id", journalId)
        .order("page_number");

      if (error) throw error;

      const rows = data ?? [];

      // Batch-generate signed URLs for all page images
      const imagePaths = rows.map((r) => r.image_path).filter(Boolean);
      let signedMap: Record<string, string> = {};

      if (imagePaths.length > 0) {
        const { data: signed } = await supabase.storage
          .from("journal_pages")
          .createSignedUrls(imagePaths, 3600);
        signedMap = Object.fromEntries(
          (signed ?? []).map((s) => [s.path, s.signedUrl])
        );
      }

      const mapped: JournalPage[] = rows.map((r) => ({
        id: r.id,
        pageNumber: r.page_number,
        imagePath: r.image_path,
        signedImageUrl: signedMap[r.image_path] ?? null,
        transcriptionText: r.transcription_text,
        transcriptionStatus: r.transcription_status,
        pendingCorrections:
          (r.pending_corrections as PendingCorrection[]) ?? [],
        correctionCount: r.correction_count,
      }));

      setPages(mapped);
      // Jump to the requested page (e.g. from a search result) without animation
      if (initialPage > 0 && initialPage < mapped.length) {
        setCurrentPage(initialPage);
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ x: initialPage * effectiveW, animated: false });
        });
      }
    } catch (err) {
      console.error("[Reader] fetchPages error:", err);
    } finally {
      setLoading(false);
    }
  }, [journalId, initialPage, effectiveW]);

  useFocusEffect(
    useCallback(() => {
      fetchPages();
    }, [fetchPages])
  );

  // ── Navigation ───────────────────────────────────────────────

  const goToPage = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(totalPages - 1, index));
      if (clamped === currentPage) return;
      Haptics.selectionAsync();
      setCurrentPage(clamped);
      setContentView("transcription");
      scrollRef.current?.scrollTo({ x: clamped * effectiveW, animated: true });
    },
    [currentPage, totalPages, effectiveW]
  );

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / effectiveW);
      if (index !== currentPage) {
        setCurrentPage(index);
        setContentView("transcription");
      }
    },
    [currentPage, effectiveW]
  );

  const handleKeyDown = useCallback(
    (e: { nativeEvent?: { key?: string } }) => {
      const key = e?.nativeEvent?.key;
      if (key === "ArrowRight") goToPage(currentPage + 1);
      else if (key === "ArrowLeft") goToPage(currentPage - 1);
    },
    [currentPage, goToPage]
  );

  // ── Edit mode ────────────────────────────────────────────────

  const updatePageText = useCallback(
    (text: string) => {
      setPages((prev) =>
        prev.map((p, i) =>
          i === currentPage ? { ...p, transcriptionText: text } : p
        )
      );
    },
    [currentPage]
  );

  const saveTranscriptionEdit = useCallback(async () => {
    const page = pages[currentPage];
    if (!page) return;
    try {
      await supabase
        .from("pages")
        .update({ transcription_text: page.transcriptionText })
        .eq("id", page.id);
    } catch (err) {
      console.error("[Reader] saveTranscriptionEdit error:", err);
    }
  }, [pages, currentPage]);

  // ── Correction modal ─────────────────────────────────────────

  const openCorrectionModal = useCallback(
    (pageIndex: number) => {
      const corrections = pages[pageIndex]?.pendingCorrections ?? [];
      if (!corrections.length) return;
      corrDecisions.current = [];
      setCorrModalPageIdx(pageIndex);
      setCorrModalCorrIdx(0);
      setCorrEditText(corrections[0].suggested);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [pages]
  );

  const advanceCorrection = useCallback(
    (decision: CorrDecision) => {
      corrDecisions.current.push(decision);
      if (corrModalPageIdx === null) return;

      const corrections = pages[corrModalPageIdx].pendingCorrections;
      const nextIdx = corrModalCorrIdx + 1;

      if (nextIdx >= corrections.length) {
        // All corrections reviewed — commit and close
        finishCorrectionSession();
      } else {
        setCorrModalCorrIdx(nextIdx);
        setCorrEditText(corrections[nextIdx].suggested);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [corrModalPageIdx, corrModalCorrIdx, pages]
  );

  const finishCorrectionSession = useCallback(async () => {
    if (corrModalPageIdx === null) return;
    setCorrSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const page = pages[corrModalPageIdx];
      const decisions = corrDecisions.current;
      const corrections = page.pendingCorrections;

      // Batch all save_correction RPC calls for non-skipped decisions
      const savePromises = decisions
        .map((d, i) => {
          if (d.kind === "saved" && corrections[i]) {
            return supabase.rpc("save_correction", {
              p_page_id: page.id,
              p_original: corrections[i].original,
              p_corrected: d.corrected,
              p_user_id: user.id,
            });
          }
          return null;
        })
        .filter(Boolean);

      await Promise.all(savePromises);

      // Remaining = only the ones marked skipped
      const remaining = corrections.filter((_, i) => {
        const d = decisions[i];
        return !d || d.kind === "skipped";
      });

      await supabase
        .from("pages")
        .update({
          pending_corrections: remaining,
          correction_count: remaining.length,
        })
        .eq("id", page.id);

      setPages((prev) =>
        prev.map((p, i) =>
          i === corrModalPageIdx
            ? { ...p, pendingCorrections: remaining, correctionCount: remaining.length }
            : p
        )
      );
    } catch (err) {
      console.error("[Reader] finishCorrectionSession error:", err);
    } finally {
      setCorrSaving(false);
      setCorrModalPageIdx(null);
    }
  }, [corrModalPageIdx, pages]);

  // ── Computed values ──────────────────────────────────────────

  const pt = Platform.OS === "web" ? 20 : insets.top;
  const pb = Platform.OS === "web" ? 24 : insets.bottom;
  const isFirst = currentPage === 0;
  const isLast = currentPage === totalPages - 1;

  const webKeyProps =
    Platform.OS === "web"
      ? ({ onKeyDown: handleKeyDown, tabIndex: 0 } as object)
      : {};

  // ── Correction modal data ────────────────────────────────────
  const corrPage =
    corrModalPageIdx !== null ? pages[corrModalPageIdx] : null;
  const corrCorrections = corrPage?.pendingCorrections ?? [];
  const corrCurrent = corrCorrections[corrModalCorrIdx];
  const corrTotal = corrCorrections.length;

  // ── Loading state ────────────────────────────────────────────

  if (loading) {
    return (
      <View
        style={[
          styles.root,
          styles.centerContent,
          { backgroundColor: colors.background, paddingTop: pt },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          style={[
            styles.loadingText,
            { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
          ]}
        >
          Loading pages…
        </Text>
      </View>
    );
  }

  // ── Empty state (journal exists but no pages yet) ────────────

  if (!loading && pages.length === 0) {
    return (
      <View
        style={[styles.root, { backgroundColor: colors.background, paddingTop: pt }]}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="arrow-left" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text
            style={[
              styles.headerTitle,
              { color: colors.foreground, fontFamily: "PlayfairDisplay_600SemiBold" },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContent}>
          <Feather name="camera" size={44} color={colors.mutedForeground} />
          <Text
            style={[
              styles.emptyTitle,
              { color: colors.foreground, fontFamily: "PlayfairDisplay_600SemiBold" },
            ]}
          >
            No pages yet
          </Text>
          <Text
            style={[
              styles.emptySubtitle,
              { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
            ]}
          >
            Photograph your first journal page{"\n"}to begin transcription.
          </Text>
          <TouchableOpacity
            style={[styles.emptyAddBtn, { backgroundColor: colors.primary }]}
            onPress={() =>
              router.push({
                pathname: "/capture",
                params: { journal_id: journalId },
              })
            }
            activeOpacity={0.85}
          >
            <Feather name="camera" size={16} color="#fff" />
            <Text style={[styles.emptyAddBtnText, { fontFamily: "Inter_600SemiBold" }]}>
              Add first page
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Main reader ──────────────────────────────────────────────

  return (
    <View
      style={[styles.root, { backgroundColor: colors.background, paddingTop: pt }]}
      accessibilityLabel={`Reader for ${title}`}
      {...webKeyProps}
    >
      {/* Fixed header + controls */}
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
                  if (!v && editMode) saveTranscriptionEdit();
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
              { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
            ]}
            accessibilityLabel={`Page ${currentPage + 1} of ${totalPages}`}
          >
            Page {currentPage + 1} of {totalPages}
          </Text>

          {/* Transcription / Original toggle (read mode only) */}
          {!editMode && (
            <View style={styles.segmentRow}>
              {(["transcription", "original"] as ContentView[]).map((view) => {
                const active = contentView === view;
                const label = view === "transcription" ? "Transcription" : "Original";
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
                          color: active ? colors.foreground : colors.mutedForeground,
                          fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
                        },
                      ]}
                    >
                      {label}
                    </Text>
                    <View
                      style={[
                        styles.segmentUnderline,
                        { backgroundColor: active ? colors.primary : "transparent" },
                      ]}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </View>

      {/* Pages horizontal scroll pager */}
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
                <View style={[styles.pageColumn, { maxWidth: MAX_CONTENT_W }]}>
                  {/* ── Original image view ────────────────── */}
                  {!editMode && contentView === "original" ? (
                    <ScrollView
                      contentContainerStyle={styles.scrollPad}
                      showsVerticalScrollIndicator={false}
                    >
                      {page.signedImageUrl ? (
                        <Image
                          source={{ uri: page.signedImageUrl }}
                          style={[
                            styles.originalImage,
                            { borderColor: colors.border },
                          ]}
                          resizeMode="contain"
                          accessibilityLabel={`Original handwritten photo of page ${index + 1}`}
                        />
                      ) : (
                        <View
                          style={[
                            styles.originalImage,
                            styles.imagePlaceholder,
                            { borderColor: colors.border, backgroundColor: colors.muted },
                          ]}
                        >
                          <Feather name="image" size={40} color={colors.mutedForeground} />
                          <Text
                            style={[
                              styles.imagePlaceholderText,
                              { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
                            ]}
                          >
                            Image unavailable
                          </Text>
                        </View>
                      )}
                    </ScrollView>

                  /* ── Edit mode ─────────────────────────── */
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
                        value={page.transcriptionText ?? ""}
                        onChangeText={updatePageText}
                        multiline
                        textAlignVertical="top"
                        accessibilityLabel={`Edit text for page ${index + 1}`}
                      />
                    </ScrollView>

                  /* ── Transcription read view ───────────── */
                  ) : (
                    <ScrollView
                      contentContainerStyle={styles.scrollPad}
                      showsVerticalScrollIndicator={false}
                    >
                      {/* Review badge */}
                      {page.correctionCount > 0 && (
                        <TouchableOpacity
                          style={[
                            styles.reviewBadge,
                            { backgroundColor: colors.primary },
                          ]}
                          onPress={() => openCorrectionModal(index)}
                          accessibilityRole="button"
                          accessibilityLabel={`${page.correctionCount} words to review on this page`}
                        >
                          <Feather name="edit-3" size={12} color="#fff" />
                          <Text
                            style={[
                              styles.reviewBadgeText,
                              { fontFamily: "Inter_600SemiBold" },
                            ]}
                          >
                            {page.correctionCount} to review
                          </Text>
                        </TouchableOpacity>
                      )}

                      {/* Transcription status indicators */}
                      {page.transcriptionStatus === "pending" ||
                      page.transcriptionStatus === "processing" ? (
                        <View style={styles.transcribingWrap}>
                          <ActivityIndicator
                            size="small"
                            color={colors.primary}
                          />
                          <Text
                            style={[
                              styles.transcribingText,
                              { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
                            ]}
                          >
                            Transcribing…
                          </Text>
                        </View>
                      ) : page.transcriptionStatus === "failed" ? (
                        <Text
                          style={[
                            styles.pageText,
                            { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
                          ]}
                        >
                          Transcription failed. Switch to Original view to see
                          the photo.
                        </Text>
                      ) : (
                        <Text
                          style={[
                            styles.pageText,
                            { color: "#4a3f35", fontFamily: "PlayfairDisplay_400Regular" },
                          ]}
                          accessibilityLabel={`Transcription of page ${index + 1}`}
                        >
                          {page.transcriptionText ?? ""}
                        </Text>
                      )}
                    </ScrollView>
                  )}
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Footer: prev/next + dots */}
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

      {/* FAB: add page (edit mode only) */}
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
            router.push({
              pathname: "/capture",
              params: { journal_id: journalId },
            });
          }}
          accessibilityRole="button"
          accessibilityLabel="Add page from photo"
          activeOpacity={0.85}
        >
          <Feather name="camera" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ── Correction modal ───────────────────────────────── */}
      <Modal
        visible={corrModalPageIdx !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setCorrModalPageIdx(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              if (!corrSaving) {
                corrDecisions.current = [];
                setCorrModalPageIdx(null);
              }
            }}
          />
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.background, paddingBottom: pb + 16 },
            ]}
          >
            {corrCurrent ? (
              <>
                {/* Sheet header */}
                <View style={styles.sheetHeader}>
                  <Text
                    style={[
                      styles.sheetProgress,
                      { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
                    ]}
                  >
                    Word {corrModalCorrIdx + 1} of {corrTotal}
                  </Text>
                  <Pressable
                    onPress={() => {
                      if (!corrSaving) {
                        corrDecisions.current = [];
                        setCorrModalPageIdx(null);
                      }
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Feather name="x" size={20} color={colors.mutedForeground} />
                  </Pressable>
                </View>

                {/* Progress dots */}
                <View style={styles.progressDots}>
                  {corrCorrections.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.progressDot,
                        {
                          backgroundColor:
                            i < corrModalCorrIdx
                              ? colors.primary
                              : i === corrModalCorrIdx
                                ? colors.primary
                                : colors.border,
                          opacity: i < corrModalCorrIdx ? 0.4 : 1,
                        },
                      ]}
                    />
                  ))}
                </View>

                {/* Uncertain word label */}
                <Text
                  style={[
                    styles.sheetLabel,
                    { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
                  ]}
                >
                  Gemini wasn't sure about:
                </Text>
                <View
                  style={[
                    styles.originalWordChip,
                    { backgroundColor: colors.muted },
                  ]}
                >
                  <Text
                    style={[
                      styles.originalWordText,
                      { color: colors.foreground, fontFamily: "PlayfairDisplay_600SemiBold" },
                    ]}
                  >
                    "{corrCurrent.original}"
                  </Text>
                </View>

                {/* Correction input */}
                <Text
                  style={[
                    styles.sheetLabel,
                    { color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 16 },
                  ]}
                >
                  Best guess — edit if needed:
                </Text>
                <TextInput
                  style={[
                    styles.corrInput,
                    {
                      color: colors.foreground,
                      borderColor: colors.primary,
                      backgroundColor: colors.card,
                      fontFamily: "PlayfairDisplay_400Regular",
                    },
                  ]}
                  value={corrEditText}
                  onChangeText={setCorrEditText}
                  autoFocus={false}
                  returnKeyType="done"
                  selectTextOnFocus
                />

                {/* Action buttons */}
                <View style={styles.sheetActions}>
                  <TouchableOpacity
                    style={[styles.skipBtn, { borderColor: colors.border }]}
                    onPress={() => advanceCorrection({ kind: "skipped" })}
                    disabled={corrSaving}
                  >
                    <Text
                      style={[
                        styles.skipBtnText,
                        { color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
                      ]}
                    >
                      Skip
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.saveBtn,
                      { backgroundColor: colors.primary },
                      corrSaving && { opacity: 0.5 },
                    ]}
                    onPress={() =>
                      advanceCorrection({
                        kind: "saved",
                        corrected: corrEditText.trim() || corrCurrent.suggested,
                      })
                    }
                    disabled={corrSaving}
                    activeOpacity={0.85}
                  >
                    {corrSaving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text
                        style={[
                          styles.saveBtnText,
                          { fontFamily: "Inter_600SemiBold" },
                        ]}
                      >
                        {corrEditText.trim() === corrCurrent.suggested
                          ? "Looks right"
                          : "Save correction"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              // All corrections processed, show completion state
              <View style={styles.corrDoneWrap}>
                <Feather name="check-circle" size={44} color={colors.primary} />
                <Text
                  style={[
                    styles.corrDoneTitle,
                    { color: colors.foreground, fontFamily: "PlayfairDisplay_600SemiBold" },
                  ]}
                >
                  All done!
                </Text>
                <Text
                  style={[
                    styles.corrDoneSub,
                    { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
                  ]}
                >
                  Your corrections are saved.
                </Text>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  centerWrap: { alignItems: "center" },
  contentColumn: { width: "100%", paddingHorizontal: H_PAD },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
    paddingBottom: 80,
  },

  loadingText: {
    fontSize: 14,
    marginTop: 12,
  },

  emptyTitle: {
    fontSize: 22,
    letterSpacing: -0.3,
    textAlign: "center",
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    opacity: 0.8,
  },
  emptyAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  emptyAddBtnText: { color: "#fff", fontSize: 15 },

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
  segmentUnderline: { height: 2, width: "100%", borderRadius: 1 },

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
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  imagePlaceholderText: { fontSize: 14 },

  transcribingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 24,
  },
  transcribingText: { fontSize: 16 },

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
  dot: { height: 7, borderRadius: 4 },

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

  // Correction modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: H_PAD,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sheetProgress: {
    fontSize: 13,
    letterSpacing: 0.2,
  },
  progressDots: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 20,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sheetLabel: {
    fontSize: 13,
    marginBottom: 8,
  },
  originalWordChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  originalWordText: {
    fontSize: 20,
  },
  corrInput: {
    fontSize: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    marginBottom: 20,
    fontFamily: "PlayfairDisplay_400Regular",
  },
  sheetActions: {
    flexDirection: "row",
    gap: 12,
  },
  skipBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
  },
  skipBtnText: { fontSize: 15 },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontSize: 15 },

  corrDoneWrap: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  corrDoneTitle: {
    fontSize: 22,
    letterSpacing: -0.3,
  },
  corrDoneSub: {
    fontSize: 15,
    opacity: 0.8,
  },
});
