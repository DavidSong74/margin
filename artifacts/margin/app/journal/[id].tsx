import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { useFocusEffect, router, useLocalSearchParams } from "expo-router";
import { decode } from "base64-arraybuffer";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import * as LocalAuthentication from "expo-local-authentication";

import { CropEditor } from "@/components/CropEditor";
import { useColors } from "@/hooks/useColors";
import { useReaderFontSize } from "@/hooks/useReaderFontSize";
import { supabase } from "@/lib/supabase";
import type { PendingCorrection } from "@/lib/database.types";

const H_PAD = 20;
const MAX_CONTENT_W = 430;

// ── Types ─────────────────────────────────────────────────────

interface JournalPage {
  id: string;
  pageNumber: number;
  imagePath: string;
  originalImagePath: string | null;
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

// ── PageItem (memoized FlatList cell) ──────────────────────────

const PageItem = React.memo(function PageItem({
  page,
  index,
  effectiveW,
  editMode,
  contentView,
  colors,
  dimmed,
  onUpdateText,
  onOpenCorrection,
  onTextSelection,
  onCropPress,
  onResetPress,
  readerFont,
}: {
  page: JournalPage;
  index: number;
  effectiveW: number;
  editMode: boolean;
  contentView: ContentView;
  colors: ReturnType<typeof useColors>;
  dimmed?: boolean;
  onUpdateText: (text: string) => void;
  onOpenCorrection: (index: number) => void;
  onTextSelection?: (sel: { start: number; end: number } | null) => void;
  onCropPress?: (pageId: string, imagePath: string, signedUrl: string) => void;
  onResetPress?: (pageId: string) => void;
  readerFont: { fontSize: number; lineHeight: number };
}) {
  const [zoomVisible, setZoomVisible] = useState(false);

  return (
    <View style={{ width: effectiveW, opacity: dimmed ? 0.25 : 1 }}>
      {/* Full-screen zoom viewer */}
      <Modal
        visible={zoomVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setZoomVisible(false)}
        statusBarTranslucent
      >
        <View style={styles.zoomOverlay}>
          <TouchableOpacity
            style={styles.zoomClose}
            onPress={() => setZoomVisible(false)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="x" size={24} color="#fff" />
          </TouchableOpacity>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.zoomScrollContent}
            maximumZoomScale={4}
            minimumZoomScale={1}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            centerContent
          >
            {page.signedImageUrl ? (
              <Image
                source={{ uri: page.signedImageUrl }}
                style={styles.zoomImage}
                resizeMode="contain"
              />
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      <View style={styles.pageCenter}>
        <View style={[styles.pageColumn, { maxWidth: MAX_CONTENT_W }]}>
          {/* ── Original image view ────────────────── */}
          {!editMode && contentView === "original" ? (
            <ScrollView
              contentContainerStyle={styles.scrollPad}
              showsVerticalScrollIndicator={false}
            >
              {page.signedImageUrl ? (
                <>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setZoomVisible(true)}
                  >
                    <Image
                      source={{ uri: page.signedImageUrl }}
                      style={[
                        styles.originalImage,
                        { borderColor: colors.border },
                      ]}
                      resizeMode="contain"
                      accessibilityLabel={`Original handwritten photo of page ${index + 1}. Tap to zoom.`}
                    />
                  </TouchableOpacity>
                  {onCropPress && (
                    <TouchableOpacity
                      style={[styles.cropBtn, { borderColor: colors.border }]}
                      onPress={() => onCropPress(page.id, page.imagePath, page.signedImageUrl!)}
                      activeOpacity={0.75}
                    >
                      <Feather name="crop" size={15} color={colors.foreground} />
                      <Text style={[styles.cropBtnText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                        Crop & Re-transcribe
                      </Text>
                    </TouchableOpacity>
                  )}
                  {onResetPress && page.originalImagePath && (
                    <TouchableOpacity
                      style={[styles.cropBtn, { borderColor: colors.destructive }]}
                      onPress={() => onResetPress(page.id)}
                      activeOpacity={0.75}
                    >
                      <Feather name="rotate-ccw" size={15} color={colors.destructive} />
                      <Text style={[styles.cropBtnText, { color: colors.destructive, fontFamily: "Inter_500Medium" }]}>
                        Restore original
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
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
                    fontSize: readerFont.fontSize,
                    color: colors.foreground,
                    backgroundColor: colors.card,
                    fontFamily: "PlayfairDisplay_400Regular",
                  },
                ]}
                value={page.transcriptionText ?? ""}
                onChangeText={onUpdateText}
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
                  onPress={() => onOpenCorrection(index)}
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
                <TextInput
                  value={page.transcriptionText ?? ""}
                  editable={false}
                  multiline
                  scrollEnabled={false}
                  selectionColor={colors.primary + "60"}
                  style={[
                    styles.pageText,
                    {
                      fontSize: readerFont.fontSize,
                      lineHeight: readerFont.lineHeight,
                      color: colors.foreground,
                      fontFamily: "PlayfairDisplay_400Regular",
                    },
                  ]}
                  accessibilityLabel={`Transcription of page ${index + 1}`}
                  onSelectionChange={(e) => {
                    const { start, end } = e.nativeEvent.selection;
                    onTextSelection?.(end > start ? { start, end } : null);
                  }}
                />
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
});

// ── Screen ─────────────────────────────────────────────────────

export default function JournalReaderScreen() {
  const colors = useColors();
  const readerFont = useReaderFontSize();
  const insets = useSafeAreaInsets();
  const { width: rawW } = useWindowDimensions();
  const params = useLocalSearchParams<{ id: string; title?: string; initial_page?: string; isPrivate?: string }>();

  const journalId = params.id;
  const title = params.title ?? "Journal";
  const initialPage = params.initial_page ? Math.max(0, parseInt(params.initial_page, 10) - 1) : 0;
  const isPrivateParam = params.isPrivate; // "true" | "false" | undefined

  const effectiveW =
    Platform.OS === "web" ? Math.min(rawW, MAX_CONTENT_W) : rawW;

  // ── Page data ────────────────────────────────────────────────
  const [pages, setPages] = useState<JournalPage[]>([]);
  const [loading, setLoading] = useState(true);

  const lastFetchedAt = useRef<number>(0);
  const FETCH_STALE_MS = 30_000; // treat data as fresh for 30 seconds
  const pagesRef = useRef<JournalPage[]>([]);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    lastFetchedAt.current = 0;
  }, [journalId]);

  // ── Per-journal privacy ───────────────────────────────────────
  const [isPrivate, setIsPrivate] = useState(false);
  // 'checking' while biometric prompt is in-flight; 'unlocked' once passed
  const [privacyState, setPrivacyState] = useState<"checking" | "unlocked">("checking");

  // ── Page reorder ──────────────────────────────────────────────
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderList, setReorderList] = useState<JournalPage[]>([]);
  const [reorderSaving, setReorderSaving] = useState(false);

  // ── Reader state ─────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [contentView, setContentView] = useState<ContentView>("transcription");

  // ── N9: In-journal search ─────────────────────────────────────
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchText, setSearchText] = useState("");

  // ── S3: Share to Feed ─────────────────────────────────────────
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [textSelection, setTextSelection] = useState<{ start: number; end: number } | null>(null);

  // ── Correction modal state ───────────────────────────────────
  const [corrModalPageIdx, setCorrModalPageIdx] = useState<number | null>(null);
  const [corrModalCorrIdx, setCorrModalCorrIdx] = useState(0);
  const [corrEditText, setCorrEditText] = useState("");
  const [corrSaving, setCorrSaving] = useState(false);
  const corrDecisions = useRef<CorrDecision[]>([]);

  // ── Crop & Re-transcribe ─────────────────────────────────────
  const [cropState, setCropState] = useState<{
    pageId: string;
    imagePath: string;
    uri: string;
  } | null>(null);

  const scrollRef = useRef<FlatList<JournalPage>>(null);
  const totalPages = pages.length;

  // ── Fetch pages ──────────────────────────────────────────────

  const fetchPages = useCallback(async () => {
    if (!journalId) return;
    const now = Date.now();
    const isStale = now - lastFetchedAt.current > FETCH_STALE_MS;
    if (!isStale && pagesRef.current.length > 0) return; // data is fresh, skip

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pages")
        .select(
          "id, page_number, image_path, original_image_path, thumbnail_path, transcription_text, transcription_status, pending_corrections, correction_count"
        )
        .eq("journal_id", journalId)
        .is("deleted_at", null)
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
        originalImagePath: r.original_image_path ?? null,
        signedImageUrl: signedMap[r.image_path] ?? null,
        transcriptionText: r.transcription_text,
        transcriptionStatus: r.transcription_status,
        pendingCorrections:
          (r.pending_corrections as PendingCorrection[]) ?? [],
        correctionCount: r.correction_count,
      }));

      lastFetchedAt.current = Date.now();
      setPages(mapped);

      // Determine which page to open: explicit route param takes priority, then AsyncStorage
      let targetPage = initialPage;
      if (targetPage === 0) {
        const saved = await AsyncStorage.getItem(`margin:lastPage:${journalId}`);
        if (saved !== null) {
          const n = parseInt(saved, 10);
          if (Number.isFinite(n) && n > 0 && n < mapped.length) targetPage = n;
        }
      }
      if (targetPage > 0) {
        setCurrentPage(targetPage);
        requestAnimationFrame(() => {
          scrollRef.current?.scrollToOffset({ offset: targetPage * effectiveW, animated: false });
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

  // ── Privacy gate: fetch is_private then trigger biometric ────
  // Runs once on mount (not re-run on focus, so auth is only asked once per session).
  useEffect(() => {
    if (!journalId) return;

    async function checkPrivacy() {
      try {
        let privateJournal: boolean;

        if (isPrivateParam !== undefined) {
          // O3: Use param from Library navigation — skip DB round trip
          privateJournal = isPrivateParam === "true";
        } else {
          const { data, error } = await supabase
            .from("journals")
            .select("is_private")
            .eq("id", journalId)
            .single();

          if (error || !data) {
            setPrivacyState("unlocked");
            return;
          }
          privateJournal = data.is_private ?? false;
        }

        setIsPrivate(privateJournal);

        if (!privateJournal) {
          setPrivacyState("unlocked");
          return;
        }

        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHardware || !isEnrolled) {
          setPrivacyState("unlocked");
          return;
        }

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: `Unlock "${title}"`,
          fallbackLabel: "Use passcode",
        });
        if (result.success) {
          setPrivacyState("unlocked");
        } else {
          router.back();
        }
      } catch {
        // Never block the journal on an unexpected error
        setPrivacyState("unlocked");
      }
    }

    checkPrivacy();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journalId]);

  // ── Persist last-read page ───────────────────────────────────

  useEffect(() => {
    if (!journalId || pages.length === 0) return;
    AsyncStorage.setItem(`margin:lastPage:${journalId}`, String(currentPage));
  }, [currentPage, journalId, pages.length]);

  // ── Realtime: update page when transcription finishes ────────

  useEffect(() => {
    if (!journalId) return;

    const channelName = `journal-pages-${journalId}`;
    // Supabase caches channels by name; a stale subscribed channel causes
    // "cannot add callbacks after subscribe()" on hot-reload / StrictMode.
    supabase
      .getChannels()
      .filter((ch) => ch.topic === `realtime:${channelName}`)
      .forEach((ch) => supabase.removeChannel(ch));

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pages",
          filter: `journal_id=eq.${journalId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            transcription_text: string | null;
            transcription_status: "pending" | "processing" | "done" | "failed";
            pending_corrections: Array<{ original: string; suggested: string }>;
            correction_count: number;
          };
          setPages((prev) =>
            prev.map((p) =>
              p.id === row.id
                ? {
                    ...p,
                    transcriptionText: row.transcription_text,
                    transcriptionStatus: row.transcription_status,
                    pendingCorrections: row.pending_corrections ?? [],
                    correctionCount: row.correction_count ?? 0,
                  }
                : p
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [journalId]);

  // ── O2: Signed URL refresh on AppState foreground ────────────
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (nextState !== "active") return;
      if (!pagesRef.current.length) return;

      // Re-generate signed URLs for all current page image paths
      const imagePaths = pagesRef.current.map((p) => p.imagePath).filter(Boolean);
      if (!imagePaths.length) return;

      const { data: signed } = await supabase.storage
        .from("journal_pages")
        .createSignedUrls(imagePaths, 3600);

      if (!signed) return;
      const signedMap: Record<string, string> = Object.fromEntries(
        signed.map((s) => [s.path, s.signedUrl])
      );

      setPages((prev) =>
        prev.map((p) => {
          const fresh = signedMap[p.imagePath];
          return fresh ? { ...p, signedImageUrl: fresh } : p;
        })
      );
    });

    return () => sub.remove();
  }, []);

  // ── O5: Transcription stuck detection + recovery ─────────────
  useEffect(() => {
    const stuckIds = pages
      .filter((p) => p.transcriptionStatus === "pending" || p.transcriptionStatus === "processing")
      .map((p) => p.id);

    if (!stuckIds.length) return;

    const timer = setInterval(async () => {
      const { data } = await supabase
        .from("pages")
        .select("id, transcription_text, transcription_status, pending_corrections, correction_count")
        .in("id", stuckIds);

      if (!data) return;

      setPages((prev) =>
        prev.map((p) => {
          const updated = data.find((d) => d.id === p.id);
          if (!updated) return p;
          return {
            ...p,
            transcriptionText: updated.transcription_text,
            transcriptionStatus: updated.transcription_status as JournalPage["transcriptionStatus"],
            pendingCorrections: (updated.pending_corrections as PendingCorrection[]) ?? [],
            correctionCount: updated.correction_count ?? 0,
          };
        })
      );
    }, 30_000);

    return () => clearInterval(timer);
  }, [pages.map((p) => p.transcriptionStatus).join(",")]);

  // ── Soft-delete current page ─────────────────────────────────

  const handleDeleteCurrentPage = useCallback(() => {
    const page = pages[currentPage];
    if (!page) return;
    Alert.alert(
      `Delete page ${page.pageNumber}?`,
      "Available to restore for 30 days in Settings → Deleted Pages.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await supabase
              .from("pages")
              .update({ deleted_at: new Date().toISOString() })
              .eq("id", page.id);
            const remaining = pages.filter((_, i) => i !== currentPage);
            if (remaining.length === 0) {
              router.back();
              return;
            }
            setPages(remaining);
            const newIdx = Math.min(currentPage, remaining.length - 1);
            setCurrentPage(newIdx);
            requestAnimationFrame(() => {
              scrollRef.current?.scrollToOffset({ offset: newIdx * effectiveW, animated: false });
            });
          },
        },
      ]
    );
  }, [pages, currentPage, effectiveW]);

  // ── Navigation ───────────────────────────────────────────────

  const goToPage = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(totalPages - 1, index));
      if (clamped === currentPage) return;
      Haptics.selectionAsync();
      setCurrentPage(clamped);
      setContentView("transcription");
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToOffset({ offset: clamped * effectiveW, animated: true });
      });
    },
    [currentPage, totalPages, effectiveW]
  );

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / effectiveW);
      if (index !== currentPage) {
        setCurrentPage(index);
        setContentView("transcription");
        setTextSelection(null);
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
    (index: number, text: string) => {
      setPages((prev) =>
        prev.map((p, i) => (i === index ? { ...p, transcriptionText: text } : p))
      );
    },
    []
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

  const finishCorrectionSession = useCallback(async () => {
    if (corrModalPageIdx === null) return;
    setCorrSaving(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("Not authenticated");

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
    [corrModalPageIdx, corrModalCorrIdx, pages, finishCorrectionSession]
  );

  // ── Retry failed transcription ───────────────────────────────

  const handleRetryTranscription = useCallback(async () => {
    const page = pages[currentPage];
    if (!page) return;

    // Immediately show the spinner on this page — hides the retry button
    setPages((prev) =>
      prev.map((p, i) =>
        i === currentPage ? { ...p, transcriptionStatus: "pending" } : p
      )
    );

    const { error } = await supabase.functions.invoke("transcribe", {
      body: { page_id: page.id },
    });

    if (error) {
      // Revert locally so the retry button reappears.
      // If the function reached the server and failed internally, Realtime will
      // also fire "failed" — the revert is a safety net for network-level errors
      // where Realtime won't fire because the DB was never updated.
      setPages((prev) =>
        prev.map((p, i) =>
          i === currentPage ? { ...p, transcriptionStatus: "failed" } : p
        )
      );
    }
    // On success, the Realtime subscription updates status to "done" automatically
  }, [pages, currentPage]);

  // ── Crop & Re-transcribe ─────────────────────────────────────

  const handleCropPress = useCallback(
    (pageId: string, imagePath: string, signedUrl: string) => {
      setCropState({ pageId, imagePath, uri: signedUrl });
    },
    []
  );

  const handleCropResult = useCallback(
    async (croppedUri: string) => {
      if (!cropState) return;
      const { pageId, imagePath } = cropState;
      setCropState(null);
      setContentView("transcription");

      setPages((prev) =>
        prev.map((p) => (p.id === pageId ? { ...p, transcriptionStatus: "processing" } : p))
      );

      try {
        const base64 = await FileSystem.readAsStringAsync(croppedUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Upload to a new path (storage RLS only allows INSERT, not UPDATE)
        const dir = imagePath.substring(0, imagePath.lastIndexOf("/") + 1);
        const newImagePath = `${dir}cropped_${Date.now()}.jpg`;

        const { error: uploadErr } = await supabase.storage
          .from("journal_pages")
          .upload(newImagePath, decode(base64), { contentType: "image/jpeg" });

        if (uploadErr) throw uploadErr;

        const { data: signed } = await supabase.storage
          .from("journal_pages")
          .createSignedUrl(newImagePath, 3600);

        // Find the current page to stash its original path before overwriting
        const currentPageData = pages.find((p) => p.id === pageId);
        const originalPath = currentPageData?.originalImagePath ?? currentPageData?.imagePath ?? imagePath;

        await supabase
          .from("pages")
          .update({
            original_image_path: originalPath,
            image_path: newImagePath,
            transcription_text: null,
            transcription_status: "pending",
            pending_corrections: [],
            correction_count: 0,
          })
          .eq("id", pageId);

        setPages((prev) =>
          prev.map((p) =>
            p.id === pageId
              ? {
                  ...p,
                  originalImagePath: p.originalImagePath ?? p.imagePath,
                  imagePath: newImagePath,
                  signedImageUrl: signed?.signedUrl ?? p.signedImageUrl,
                  transcriptionText: null,
                  transcriptionStatus: "pending",
                  pendingCorrections: [],
                  correctionCount: 0,
                }
              : p
          )
        );

        // Delete the replaced file, but never delete the user's original
        if (imagePath !== originalPath) {
          supabase.storage
            .from("journal_pages")
            .remove([imagePath])
            .catch((e) => console.warn("[Reader] cleanup old crop:", e));
        }

        await supabase.functions.invoke("transcribe", { body: { page_id: pageId } });
      } catch (err) {
        console.error("[Reader] crop upload error:", err);
        setPages((prev) =>
          prev.map((p) => (p.id === pageId ? { ...p, transcriptionStatus: "failed" } : p))
        );
        Alert.alert("Error", "Could not upload cropped image. Please try again.");
      }
    },
    [cropState]
  );

  // ── Restore original image ───────────────────────────────────

  const handleResetCrop = useCallback(async (pageId: string) => {
    const page = pages.find((p) => p.id === pageId);
    if (!page?.originalImagePath) return;

    Alert.alert(
      "Restore original?",
      "This will replace the cropped image and re-transcribe the original photo.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: async () => {
            setPages((prev) =>
              prev.map((p) =>
                p.id === pageId ? { ...p, transcriptionStatus: "processing" } : p
              )
            );

            const { data: signed } = await supabase.storage
              .from("journal_pages")
              .createSignedUrl(page.originalImagePath!, 3600);

            await supabase
              .from("pages")
              .update({
                image_path: page.originalImagePath,
                original_image_path: null,
                transcription_text: null,
                transcription_status: "pending",
                pending_corrections: [],
                correction_count: 0,
              })
              .eq("id", pageId);

            setPages((prev) =>
              prev.map((p) =>
                p.id === pageId
                  ? {
                      ...p,
                      imagePath: page.originalImagePath!,
                      originalImagePath: null,
                      signedImageUrl: signed?.signedUrl ?? p.signedImageUrl,
                      transcriptionText: null,
                      transcriptionStatus: "pending",
                      pendingCorrections: [],
                      correctionCount: 0,
                    }
                  : p
              )
            );

            await supabase.functions.invoke("transcribe", { body: { page_id: pageId } });
          },
        },
      ]
    );
  }, [pages]);

  // ── Per-journal privacy toggle ───────────────────────────────

  const togglePrivacy = useCallback(async () => {
    const newValue = !isPrivate;
    await supabase
      .from("journals")
      .update({ is_private: newValue })
      .eq("id", journalId);
    setIsPrivate(newValue);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      newValue ? "Journal locked" : "Journal unlocked",
      newValue
        ? "This journal now requires Face ID or Touch ID to open."
        : "This journal can be opened without biometric authentication.",
    );
  }, [isPrivate, journalId]);

  // ── N8 + S3: Share current page ──────────────────────────────

  const handleShare = useCallback(() => {
    const page = pages[currentPage];
    Alert.alert("Share", undefined, [
      ...(page?.transcriptionText
        ? [
            {
              text: "Share transcription text",
              onPress: () =>
                Share.share({
                  message: page.transcriptionText!,
                  title: `${title} — Page ${page.pageNumber}`,
                }),
            },
          ]
        : []),
      {
        text: "Share to Feed",
        onPress: () => {
          setSelectedPageIds(page ? [page.id] : []);
          setShareModalVisible(true);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [pages, currentPage, title]);

  // ── S3: Share pages to Feed ───────────────────────────────────

  const togglePageSelection = useCallback((pageId: string) => {
    setSelectedPageIds((prev) =>
      prev.includes(pageId)
        ? prev.filter((id) => id !== pageId)
        : [...prev, pageId]
    );
  }, []);

  const handleShareToFeed = useCallback(async () => {
    const pageId = selectedPageIds[0];
    if (!pageId) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const selectedPage = pages.find((p) => p.id === pageId);
    const excerptText = selectedPage?.transcriptionText ?? "";

    if (!excerptText.trim()) {
      Alert.alert("Nothing to share", "This page has no transcription yet.");
      return;
    }

    const { error } = await supabase.from("shared_entries").insert({
      user_id: session.user.id,
      page_id: pageId,
      excerpt_text: excerptText,
      share_type: "page",
    });

    if (error) {
      Alert.alert("Error", "Could not share. Check your connection and try again.");
      return;
    }

    setShareModalVisible(false);
    setSelectedPageIds([]);
    Alert.alert("Shared!", "Your entry is now visible to your friends in their Feed.");
  }, [pages, selectedPageIds]);

  // ── S3: Share text selection snippet to Feed ──────────────────

  const handleShareSelection = useCallback(async () => {
    if (!textSelection) return;
    const page = pages[currentPage];
    const snippet = (page?.transcriptionText ?? "")
      .slice(textSelection.start, textSelection.end)
      .trim();
    if (!snippet) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    if (!page) return;

    const { error } = await supabase.from("shared_entries").insert({
      user_id: session.user.id,
      page_id: page.id,
      excerpt_text: snippet,
      share_type: "snippet",
    });

    if (error) {
      Alert.alert("Error", "Could not share. Check your connection and try again.");
      return;
    }

    setTextSelection(null);
    Alert.alert("Shared!", "Your snippet is now visible to your friends.");
  }, [textSelection, pages, currentPage]);

  // ── N9: Search within journal ────────────────────────────────

  const matchingPageIndices = React.useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return null;
    return pages.reduce<number[]>((acc, p, i) => {
      if (p.transcriptionText?.toLowerCase().includes(q)) acc.push(i);
      return acc;
    }, []);
  }, [pages, searchText]);

  const jumpToNextMatch = useCallback(() => {
    if (!matchingPageIndices?.length) return;
    const next =
      matchingPageIndices.find((i) => i > currentPage) ?? matchingPageIndices[0];
    setCurrentPage(next);
    scrollRef.current?.scrollToOffset({ offset: next * effectiveW, animated: true });
  }, [matchingPageIndices, currentPage, effectiveW]);

  const jumpToPrevMatch = useCallback(() => {
    if (!matchingPageIndices?.length) return;
    const prev =
      [...matchingPageIndices].reverse().find((i) => i < currentPage) ??
      matchingPageIndices[matchingPageIndices.length - 1];
    setCurrentPage(prev);
    scrollRef.current?.scrollToOffset({ offset: prev * effectiveW, animated: true });
  }, [matchingPageIndices, currentPage, effectiveW]);

  // ── Page reorder ─────────────────────────────────────────────

  const openReorder = useCallback(() => {
    setReorderList([...pages]);
    setReorderMode(true);
  }, [pages]);

  const movePage = useCallback((from: number, to: number) => {
    setReorderList((prev) => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const saveReorder = useCallback(async () => {
    setReorderSaving(true);
    try {
      await supabase.rpc("reorder_pages", {
        p_journal_id: journalId,
        p_page_ids: reorderList.map((p) => p.id),
      });
      setPages(reorderList.map((p, i) => ({ ...p, pageNumber: i + 1 })));
      setReorderMode(false);
      setReorderList([]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not save page order. Please try again.");
    } finally {
      setReorderSaving(false);
    }
  }, [journalId, reorderList]);

  // ── Memoized FlatList renderItem ────────────────────────────

  const handleTextSelection = useCallback(
    (sel: { start: number; end: number } | null) => setTextSelection(sel),
    []
  );

  const renderPageItem = useCallback(
    ({ item: page, index }: { item: JournalPage; index: number }) => (
      <PageItem
        page={page}
        index={index}
        effectiveW={effectiveW}
        editMode={editMode}
        contentView={contentView}
        colors={colors}
        dimmed={matchingPageIndices !== null && !matchingPageIndices.includes(index)}
        onUpdateText={(text) => updatePageText(index, text)}
        onOpenCorrection={openCorrectionModal}
        onTextSelection={handleTextSelection}
        onCropPress={handleCropPress}
        onResetPress={handleResetCrop}
        readerFont={readerFont}
      />
    ),
    [effectiveW, editMode, contentView, colors, matchingPageIndices, updatePageText, openCorrectionModal, handleTextSelection, handleCropPress, handleResetCrop, readerFont]
  );

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

  // ── Loading state (pages + privacy check) ───────────────────

  if (loading || privacyState === "checking") {
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
          {privacyState === "checking" && isPrivate ? "Authenticating…" : "Loading pages…"}
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

            {editMode && (
              <>
                <TouchableOpacity
                  style={styles.headerIconBtn}
                  onPress={togglePrivacy}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={isPrivate ? "Unlock this journal" : "Lock this journal"}
                >
                  <Feather
                    name={isPrivate ? "lock" : "unlock"}
                    size={20}
                    color={isPrivate ? colors.primary : colors.mutedForeground}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerIconBtn}
                  onPress={openReorder}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Reorder pages"
                >
                  <Feather name="list" size={20} color={colors.foreground} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deletePageBtn}
                  onPress={handleDeleteCurrentPage}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Delete this page"
                >
                  <Feather name="trash-2" size={20} color={colors.destructive} />
                </TouchableOpacity>
              </>
            )}

            {pages[currentPage]?.transcriptionStatus === "failed" && (
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={handleRetryTranscription}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Retry transcription"
              >
                <Feather name="refresh-cw" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}

            {!editMode && (
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={handleShare}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Share this page"
              >
                <Feather name="share" size={19} color={colors.foreground} />
              </TouchableOpacity>
            )}

            {!editMode && (
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={() => {
                  setSearchVisible((v) => !v);
                  if (searchVisible) setSearchText("");
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Search pages"
              >
                <Feather
                  name="search"
                  size={19}
                  color={searchVisible ? colors.primary : colors.foreground}
                />
              </TouchableOpacity>
            )}

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

          {/* N9: Search bar */}
          {searchVisible && (
            <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Feather name="search" size={15} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search pages…"
                placeholderTextColor={colors.mutedForeground}
                autoFocus
                returnKeyType="search"
              />
              {matchingPageIndices !== null && (
                <>
                  <Text style={[styles.searchCount, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {matchingPageIndices.length}
                  </Text>
                  <TouchableOpacity onPress={jumpToPrevMatch} disabled={!matchingPageIndices.length} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="chevron-up" size={20} color={matchingPageIndices.length ? colors.foreground : colors.border} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={jumpToNextMatch} disabled={!matchingPageIndices.length} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="chevron-down" size={20} color={matchingPageIndices.length ? colors.foreground : colors.border} />
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity onPress={() => { setSearchVisible(false); setSearchText(""); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          )}

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
        <FlatList
          ref={scrollRef}
          data={pages}
          horizontal
          pagingEnabled
          scrollEnabled={!editMode}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumScrollEnd}
          scrollEventThrottle={16}
          keyExtractor={(item) => item.id}
          getItemLayout={(_data, index) => ({
            length: effectiveW,
            offset: effectiveW * index,
            index,
          })}
          windowSize={5}
          initialNumToRender={3}
          maxToRenderPerBatch={2}
          removeClippedSubviews={false}
          renderItem={renderPageItem}
        />
      </View>

      {/* S3: Text selection bar — share selected snippet to Feed */}
      {textSelection && !editMode && (
        <View
          style={[
            styles.selectionBar,
            { backgroundColor: colors.card, borderTopColor: colors.border },
          ]}
        >
          <TouchableOpacity
            onPress={handleShareSelection}
            style={styles.selectionAction}
          >
            <Feather name="send" size={16} color={colors.primary} />
            <Text
              style={[
                styles.selectionActionText,
                { color: colors.primary, fontFamily: "Inter_600SemiBold" },
              ]}
            >
              Share snippet to Feed
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTextSelection(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="x" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      )}

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

      {/* ── S3: Share to Feed page picker modal ───────────── */}
      <Modal
        visible={shareModalVisible}
        animationType="slide"
        onRequestClose={() => { setShareModalVisible(false); setSelectedPageIds([]); }}
      >
        <View style={[styles.root, { backgroundColor: colors.background, paddingTop: pt }]}>
          <View style={[styles.header, { paddingHorizontal: H_PAD }]}>
            <TouchableOpacity
              onPress={() => { setShareModalVisible(false); setSelectedPageIds([]); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={[styles.reorderActionText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "PlayfairDisplay_600SemiBold" }]}>
                Share to Feed
              </Text>
              <Text style={[styles.shareSubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Select one page
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleShareToFeed}
              disabled={selectedPageIds.length === 0}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text
                style={[
                  styles.reorderActionText,
                  {
                    color: selectedPageIds.length > 0 ? colors.primary : colors.mutedForeground,
                    fontFamily: "Inter_600SemiBold",
                    opacity: selectedPageIds.length > 0 ? 1 : 0.4,
                  },
                ]}
              >
                Share
              </Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={pages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: H_PAD, paddingTop: 8, paddingBottom: 40 }}
            renderItem={({ item }) => {
              const isSelected = selectedPageIds.includes(item.id);
              const maxReached = !isSelected && selectedPageIds.length >= 1;
              return (
                <TouchableOpacity
                  style={[
                    styles.reorderItem,
                    { borderBottomColor: colors.border },
                    isSelected && { backgroundColor: colors.primary + "12" },
                    maxReached && { opacity: 0.4 },
                  ]}
                  onPress={() => !maxReached && togglePageSelection(item.id)}
                  disabled={maxReached}
                  activeOpacity={0.7}
                >
                  {item.signedImageUrl ? (
                    <Image
                      source={{ uri: item.signedImageUrl }}
                      style={[styles.reorderThumb, { borderColor: colors.border }]}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.reorderThumb, { backgroundColor: colors.muted, borderColor: colors.border }]} />
                  )}
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.reorderPageLabel, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                      Page {item.pageNumber}
                    </Text>
                    <Text
                      style={[styles.shareSnippet, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                      numberOfLines={2}
                    >
                      {item.transcriptionText ?? "No transcription"}
                    </Text>
                  </View>
                  {isSelected && (
                    <Feather name="check-circle" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>

      {/* ── Reorder modal ──────────────────────────────────── */}
      <Modal
        visible={reorderMode}
        animationType="slide"
        onRequestClose={() => { setReorderMode(false); setReorderList([]); }}
      >
        <View style={[styles.root, { backgroundColor: colors.background, paddingTop: pt }]}>
          {/* Modal header */}
          <View style={[styles.header, { paddingHorizontal: H_PAD }]}>
            <TouchableOpacity
              onPress={() => { setReorderMode(false); setReorderList([]); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text
                style={[
                  styles.reorderActionText,
                  { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
                ]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <Text
              style={[
                styles.headerTitle,
                { color: colors.foreground, fontFamily: "PlayfairDisplay_600SemiBold" },
              ]}
            >
              Reorder Pages
            </Text>
            <TouchableOpacity
              onPress={saveReorder}
              disabled={reorderSaving}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {reorderSaving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text
                  style={[
                    styles.reorderActionText,
                    { color: colors.primary, fontFamily: "Inter_600SemiBold" },
                  ]}
                >
                  Done
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <FlatList
            data={reorderList}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: H_PAD, paddingTop: 8, paddingBottom: 40 }}
            renderItem={({ item, index }) => (
              <View
                style={[
                  styles.reorderItem,
                  { borderBottomColor: colors.border },
                ]}
              >
                {item.signedImageUrl ? (
                  <Image
                    source={{ uri: item.signedImageUrl }}
                    style={[styles.reorderThumb, { borderColor: colors.border }]}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={[
                      styles.reorderThumb,
                      { backgroundColor: colors.muted, borderColor: colors.border },
                    ]}
                  />
                )}
                <Text
                  style={[
                    styles.reorderPageLabel,
                    { color: colors.foreground, fontFamily: "Inter_500Medium" },
                  ]}
                >
                  Page {index + 1}
                </Text>
                <View style={styles.reorderArrows}>
                  <TouchableOpacity
                    onPress={() => movePage(index, index - 1)}
                    disabled={index === 0}
                    style={{ opacity: index === 0 ? 0.25 : 1 }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="chevron-up" size={22} color={colors.foreground} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => movePage(index, index + 1)}
                    disabled={index === reorderList.length - 1}
                    style={{ opacity: index === reorderList.length - 1 ? 0.25 : 1 }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="chevron-down" size={22} color={colors.foreground} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </View>
      </Modal>

      {/* ── Crop & Re-transcribe modal ─────────────────────── */}
      <Modal
        visible={cropState !== null}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setCropState(null)}
      >
        {cropState && (
          <CropEditor
            uri={cropState.uri}
            onCrop={handleCropResult}
            onCancel={() => setCropState(null)}
          />
        )}
      </Modal>

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

  // Delete page button (visible in edit mode)
  deletePageBtn: {
    padding: 6,
  },

  // Lock / reorder buttons in header edit mode
  headerIconBtn: {
    padding: 6,
  },

  // N9: Search bar
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 2,
  },
  searchCount: {
    fontSize: 13,
    minWidth: 20,
    textAlign: "right",
  },

  // S3: Text selection bar
  selectionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: H_PAD,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  selectionAction: { flexDirection: "row", alignItems: "center", gap: 8 },
  selectionActionText: { fontSize: 14 },

  // S3: Share modal
  shareSubtitle: { fontSize: 12, textAlign: "center", marginTop: 2 },
  shareSnippet: { fontSize: 12, lineHeight: 16 },

  // Reorder modal
  reorderActionText: { fontSize: 15 },
  reorderItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reorderThumb: {
    width: 48,
    height: 64,
    borderRadius: 6,
    borderWidth: 1,
  },
  reorderPageLabel: { flex: 1, fontSize: 15 },
  reorderArrows: {
    flexDirection: "column",
    gap: 4,
    alignItems: "center",
  },

  // Crop button (Original tab)
  cropBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  cropBtnText: { fontSize: 14 },

  // Full-screen image zoom viewer
  zoomOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
  },
  zoomClose: {
    position: "absolute",
    top: 52,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  zoomScrollContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomImage: {
    width: "100%",
    height: "100%",
    aspectRatio: 3 / 4,
  },
});
