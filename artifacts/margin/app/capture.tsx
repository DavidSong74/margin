import { Feather } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { decode } from "base64-arraybuffer";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { CropEditor } from "@/components/CropEditor";
import { supabase } from "@/lib/supabase";
import { enqueueCapture } from "@/lib/captureQueue";

// ── Pre-computed Base64 map for fast decoding ─────────────

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_MAP = new Uint8Array(256);
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_MAP[B64_CHARS.charCodeAt(i)] = i;
}

// ── Types ─────────────────────────────────────────────────

type ScreenState = "permission" | "viewfinder" | "crop" | "preview" | "uploading" | "batch_uploading";

type QualityIssue = "dark" | "blur" | null;

const BRACKET = 28; // corner bracket arm length
const BRACKET_T = 3; // bracket thickness

// ── Corner bracket component ───────────────────────────────

function Corner({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
  const isTop = position === "tl" || position === "tr";
  const isLeft = position === "tl" || position === "bl";
  return (
    <View
      style={[
        styles.corner,
        isTop ? { top: -1 } : { bottom: -1 },
        isLeft ? { left: -1 } : { right: -1 },
      ]}
    >
      {/* Horizontal arm */}
      <View
        style={[
          styles.bracketArm,
          styles.bracketH,
          isLeft ? { left: 0 } : { right: 0 },
          isTop ? { top: 0 } : { bottom: 0 },
        ]}
      />
      {/* Vertical arm */}
      <View
        style={[
          styles.bracketArm,
          styles.bracketV,
          isLeft ? { left: 0 } : { right: 0 },
          isTop ? { top: 0 } : { bottom: 0 },
        ]}
      />
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────

export default function CaptureScreen() {
  const { journal_id } = useLocalSearchParams<{ journal_id: string }>();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const FRAME_W = SCREEN_W * 0.88;
  const FRAME_H = FRAME_W * (4 / 3);
  const [permission, requestPermission] = useCameraPermissions();

  const [facing] = useState<CameraType>("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [screen, setScreen] = useState<ScreenState>("viewfinder");
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [qualityIssue, setQualityIssue] = useState<QualityIssue>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchCount, setBatchCount] = useState(0);
  const [startPageNumber, setStartPageNumber] = useState<number | null>(null);
  const [capturedDims, setCapturedDims] = useState<{ width: number; height: number } | null>(null);

  const cameraRef = useRef<CameraView>(null);
  const flashAnim = useRef(new Animated.Value(0)).current;

  // ── Crop photo to match the on-screen frame ───────────
  // The CameraView fills the screen in "cover" mode. The captured photo
  // is at full sensor resolution and wider than what the frame shows.
  // We crop it to exactly the region the frame outlined.

  const cropToFrame = useCallback(async (
    uri: string,
    photoW: number,
    photoH: number,
  ): Promise<{ uri: string; width: number; height: number }> => {
    const frameTopOnScreen = (SCREEN_H - FRAME_H) / 2 - 20;

    // Scale factor for "cover" — whichever axis fills first
    const previewScale = Math.max(SCREEN_W / photoW, SCREEN_H / photoH);

    // Where the photo's top-left corner sits in screen space (may be negative)
    const photoScreenLeft = (SCREEN_W - photoW * previewScale) / 2;
    const photoScreenTop  = (SCREEN_H - photoH * previewScale) / 2;

    // Frame position in screen space → photo pixels
    const frameScreenLeft = (SCREEN_W - FRAME_W) / 2;
    const originX = Math.max(0, Math.round((frameScreenLeft - photoScreenLeft) / previewScale));
    const originY = Math.max(0, Math.round((frameTopOnScreen  - photoScreenTop)  / previewScale));
    const cropW   = Math.min(Math.round(FRAME_W / previewScale), photoW - originX);
    const cropH   = Math.min(Math.round(FRAME_H / previewScale), photoH - originY);

    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ crop: { originX, originY, width: cropW, height: cropH } }],
      { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG },
    );
    return { uri: result.uri, width: result.width, height: result.height };
  }, [SCREEN_W, SCREEN_H, FRAME_W, FRAME_H]);

  // ── Capture ────────────────────────────────────────────
  // All hooks must be declared before any early returns.

  const capture = useCallback(async () => {
    if (!cameraRef.current) return;

    // White flash feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();

    const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, skipProcessing: false });
    if (!photo) return;

    const cropped = await cropToFrame(photo.uri, photo.width, photo.height);
    const issue = await checkQuality(cropped.uri);
    setQualityIssue(issue);
    setCapturedUri(cropped.uri);
    setCapturedDims({ width: cropped.width, height: cropped.height });
    setScreen("crop");
  }, [flashAnim, cropToFrame]);

  // ── Quality check ─────────────────────────────────────
  // Heuristic: compress to 100px wide, sample average pixel brightness.
  // Low brightness → "dark". High uniformity (low variance) → "blur".
  // These are soft warnings — never hard blocks.

  const checkQuality = async (uri: string): Promise<QualityIssue> => {
    try {
      const thumb = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 100 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!thumb.base64) return null;

      // Decode base64 without atob (not available on Hermes/Android)
      const b64 = thumb.base64.replace(/=/g, "");
      let totalLuminance = 0;
      let pixelCount = 0;
      // Decode 4 base64 chars → 3 bytes, sample RGB triplets for luminance
      for (let i = 0; i + 3 < b64.length; i += 4) {
        const n =
          (B64_MAP[b64.charCodeAt(i)] << 18) |
          (B64_MAP[b64.charCodeAt(i + 1)] << 12) |
          (B64_MAP[b64.charCodeAt(i + 2)] << 6) |
          B64_MAP[b64.charCodeAt(i + 3)];
        const r = (n >> 16) & 0xff;
        const g = (n >> 8) & 0xff;
        const b = n & 0xff;
        totalLuminance += 0.299 * r + 0.587 * g + 0.114 * b;
        pixelCount++;
      }
      const avgLuminance = totalLuminance / pixelCount;
      if (avgLuminance < 40) return "dark"; // Very dark image
      return null;
    } catch {
      return null;
    }
  };

  // ── Single-photo upload helper (shared by usePhoto + pickAndUploadPhotos) ──

  const uploadSinglePhoto = useCallback(async (
    uri: string,
    pageNumber: number,
    user: { id: string },
  ): Promise<void> => {
    const pageId = Crypto.randomUUID();
    const imagePath = `${user.id}/${journal_id}/${pageId}.jpg`;
    const thumbPath = `${user.id}/${journal_id}/${pageId}_thumb.jpg`;

    const thumbnail = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 800 } }],
      { compress: 0.3, format: ImageManipulator.SaveFormat.JPEG },
    );

    const imageBase64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
    const { error: imageErr } = await supabase.storage
      .from("journal_pages")
      .upload(imagePath, decode(imageBase64), { contentType: "image/jpeg" });
    if (imageErr) throw imageErr;

    const thumbBase64 = await FileSystem.readAsStringAsync(thumbnail.uri, { encoding: "base64" });
    await supabase.storage
      .from("journal_pages")
      .upload(thumbPath, decode(thumbBase64), { contentType: "image/jpeg" });

    const { error: insertErr } = await supabase.from("pages").insert({
      id: pageId,
      journal_id,
      page_number: pageNumber,
      image_path: imagePath,
      thumbnail_path: thumbPath,
      transcription_status: "pending",
    });
    if (insertErr) throw insertErr;

    AsyncStorage.getItem("margin:settings").then((raw) => {
      const quality = raw ? (JSON.parse(raw).transcriptionQuality ?? "balanced") : "balanced";
      supabase.functions
        .invoke("transcribe", { body: { page_id: pageId, quality } })
        .catch((err) => console.warn("[transcribe] invoke failed:", err));
    });
  }, [journal_id]);

  // ── Upload ─────────────────────────────────────────────

  const usePhoto = useCallback(async () => {
    if (!capturedUri || !journal_id) return;

    setScreen("uploading");
    setUploadError(null);
    setUploadProgress(0);

    let pageNumber = 1; // resolved below; declared here so catch block can access it
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Not authenticated");

      // Determine page number — query DB for highest page_number on first shot; increment locally after
      if (startPageNumber === null) {
        const { data: maxPageData } = await supabase
          .from("pages")
          .select("page_number")
          .eq("journal_id", journal_id)
          .order("page_number", { ascending: false })
          .limit(1);
        const maxPage = maxPageData?.[0]?.page_number ?? 0;
        const base = maxPage + 1;
        setStartPageNumber(base);
        pageNumber = base + batchCount;
      } else {
        pageNumber = startPageNumber + batchCount;
      }


      setUploadProgress(20);
      await uploadSinglePhoto(capturedUri, pageNumber, user);
      setUploadProgress(100);

      // Return to viewfinder for next shot; Done button navigates to reader
      setBatchCount((n) => n + 1);
      setCapturedUri(null);
      setQualityIssue(null);
      setUploadError(null);
      setUploadProgress(0);
      setScreen("viewfinder");
    } catch (err) {
      // N7: On failure, copy photo to persistent storage and enqueue for retry
      try {
        if (capturedUri && journal_id) {
          const persistedUri =
            (FileSystem.documentDirectory ?? "") + `queue_${Date.now()}.jpg`;
          await FileSystem.copyAsync({ from: capturedUri, to: persistedUri });
          await enqueueCapture({
            uri: persistedUri,
            journalId: journal_id,
            pageNumber,
          });
          Alert.alert(
            "Saved offline",
            "Photo saved locally and will upload when connectivity is restored.",
          );
          setBatchCount((n) => n + 1);
          setCapturedUri(null);
          setQualityIssue(null);
          setUploadError(null);
          setUploadProgress(0);
          setScreen("viewfinder");
        } else {
          throw err;
        }
      } catch {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setUploadError(msg);
        setScreen("preview");
      }
    }
  }, [capturedUri, journal_id, startPageNumber, batchCount, uploadSinglePhoto]);

  const retake = useCallback(() => {
    setCapturedUri(null);
    setQualityIssue(null);
    setUploadError(null);
    setScreen("viewfinder");
  }, []);

  // ── Pick multiple photos from library ──────────────────

  const pickAndUploadPhotos = useCallback(async () => {
    if (!journal_id) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.9,
      orderedSelection: true,
    });
    if (result.canceled || result.assets.length === 0) return;

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const { data: maxPageData } = await supabase
      .from("pages")
      .select("page_number")
      .eq("journal_id", journal_id)
      .order("page_number", { ascending: false })
      .limit(1);
    const maxPage = maxPageData?.[0]?.page_number ?? 0;
    const base = maxPage + 1;

    setScreen("batch_uploading");
    setBatchProgress({ current: 0, total: result.assets.length });

    let successCount = 0;
    let failCount = 0;
    const BATCH_SIZE = 2;

    try {
      for (let i = 0; i < result.assets.length; i += BATCH_SIZE) {
        const chunk = result.assets.slice(i, i + BATCH_SIZE);
        await Promise.all(
          chunk.map(async (asset, idx) => {
            try {
              await uploadSinglePhoto(asset.uri, base + i + idx, user);
              successCount++;
            } catch (err) {
              console.error(`[capture] Failed to upload photo ${i + idx}:`, err);
              failCount++;
            }
          })
        );
        setBatchProgress({
          current: Math.min(i + BATCH_SIZE, result.assets.length),
          total: result.assets.length,
        });
      }

      if (failCount > 0) {
        Alert.alert(
          "Import Completed",
          `Successfully uploaded ${successCount} page(s). ${failCount} page(s) failed.`
        );
      }

      if (successCount > 0) {
        router.replace({ pathname: "/journal/[id]", params: { id: journal_id } });
      } else {
        setUploadError("Failed to upload selected photos.");
        setScreen("viewfinder");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadError(msg);
      setScreen("viewfinder");
    }
  }, [journal_id, uploadSinglePhoto]);

  // ── Reset batch state on unmount ───────────────────────

  useEffect(() => {
    return () => {
      setBatchCount(0);
      setStartPageNumber(null);
    };
  }, []);

  const toggleFlash = useCallback(() => {
    setFlash((f: FlashMode) => (f === "off" ? "on" : f === "on" ? "auto" : "off"));
  }, []);

  const flashIcon = flash === "on" ? "zap" : flash === "auto" ? "zap" : "zap-off";
  const flashLabel = flash === "on" ? "On" : flash === "auto" ? "Auto" : "Off";

  // ── Permission guards (after all hooks) ────────────────

  if (!permission) return <View style={styles.bg} />;

  if (!permission.granted) {
    return (
      <View style={[styles.bg, styles.centered]}>
        <Feather name="camera-off" size={40} color="#fff" style={{ marginBottom: 20 }} />
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permDesc}>
          Margin photographs your journal pages. Grant camera access to continue.
        </Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant access</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={styles.permBack}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Viewfinder ─────────────────────────────────────────

  if (screen === "viewfinder") {
    const frameTop = (SCREEN_H - FRAME_H) / 2 - 20; // slight offset above center
    return (
      <View style={styles.bg}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
        />

        {/* Capture flash overlay */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: "#fff", opacity: flashAnim }]}
        />

        {/* Semi-transparent vignette outside the scan frame */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Top strip */}
          <View style={[styles.vignette, { height: frameTop }]} />
          {/* Middle row — left + right strips */}
          <View style={{ flexDirection: "row", height: FRAME_H }}>
            <View style={[styles.vignette, { width: (SCREEN_W - FRAME_W) / 2 }]} />
            <View style={{ width: FRAME_W }} />
            <View style={[styles.vignette, { width: (SCREEN_W - FRAME_W) / 2 }]} />
          </View>
          {/* Bottom strip */}
          <View style={[styles.vignette, { flex: 1 }]} />
        </View>

        {/* Alignment frame with corner brackets */}
        <View
          pointerEvents="none"
          style={[
            styles.frame,
            { width: FRAME_W, height: FRAME_H, top: frameTop, left: (SCREEN_W - FRAME_W) / 2 },
          ]}
        >
          <Corner position="tl" />
          <Corner position="tr" />
          <Corner position="bl" />
          <Corner position="br" />
        </View>

        {/* Instruction label */}
        <View
          style={[
            styles.instructionWrap,
            { top: frameTop - 40 },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.instruction}>Align page within the frame</Text>
        </View>

        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="x" size={22} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={toggleFlash}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name={flashIcon} size={20} color={flash === "off" ? "rgba(255,255,255,0.5)" : "#FFD700"} />
            <Text style={[styles.flashLabel, { color: flash === "off" ? "rgba(255,255,255,0.4)" : "#FFD700" }]}>
              {flashLabel}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Done button — appears once at least one page has been captured */}
        {batchCount > 0 && (
          <TouchableOpacity
            style={[styles.doneBtn, { top: insets.top + 60 }]}
            onPress={() => router.replace({ pathname: "/journal/[id]", params: { id: journal_id } })}
          >
            <Text style={styles.doneBtnText}>Done ({batchCount})</Text>
          </TouchableOpacity>
        )}

        {/* Bottom controls */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
          {/* Library picker */}
          <TouchableOpacity style={styles.libraryBtn} onPress={pickAndUploadPhotos}>
            <Feather name="image" size={22} color="#fff" />
          </TouchableOpacity>

          {/* Shutter */}
          <View style={{ alignItems: "center" }}>
            <TouchableOpacity style={styles.shutter} onPress={capture} activeOpacity={0.85}>
              <View style={styles.shutterInner} />
            </TouchableOpacity>
            {batchCount > 0 && (
              <Text style={styles.batchBadge}>
                {batchCount} page{batchCount !== 1 ? "s" : ""} added
              </Text>
            )}
          </View>

          <View style={{ width: 52 }} />
        </View>
      </View>
    );
  }

  // ── Crop ──────────────────────────────────────────────

  if (screen === "crop" && capturedUri) {
    return (
      <CropEditor
        uri={capturedUri}
        onCrop={(croppedUri) => {
          setCapturedUri(croppedUri);
          setScreen("preview");
        }}
        onCancel={() => setScreen("preview")}
      />
    );
  }

  // ── Preview ────────────────────────────────────────────

  if (screen === "preview" && capturedUri) {
    return (
      <View style={styles.bg}>
        <Image
          source={{ uri: capturedUri }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
        />

        {/* Quality warning banner */}
        {qualityIssue && (
          <View style={[styles.warningBanner, { top: insets.top + 12 }]}>
            <Feather
              name={qualityIssue === "dark" ? "moon" : "wind"}
              size={14}
              color="#fff"
              style={{ marginRight: 6 }}
            />
            <Text style={styles.warningText}>
              {qualityIssue === "dark"
                ? "Photo looks dark — try better lighting"
                : "Photo may be blurry — try holding still"}
            </Text>
          </View>
        )}

        {/* Upload error */}
        {uploadError && (
          <View style={[styles.warningBanner, styles.errorBanner, { top: insets.top + 12 }]}>
            <Feather name="alert-circle" size={14} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.warningText}>{uploadError}</Text>
          </View>
        )}

        {/* Top close */}
        <TouchableOpacity
          style={[styles.previewClose, { top: insets.top + 12 }]}
          onPress={retake}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="x" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Bottom action buttons */}
        <View style={[styles.previewActions, { paddingBottom: insets.bottom + 32 }]}>
          <TouchableOpacity style={styles.retakeBtn} onPress={retake}>
            <Feather name="rotate-ccw" size={16} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.retakeBtnText}>Retake</Text>
          </TouchableOpacity>
          {capturedDims && (
            <TouchableOpacity
              style={styles.retakeBtn}
              onPress={() => setScreen("crop")}
            >
              <Feather name="crop" size={16} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.retakeBtnText}>Crop</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.useBtn} onPress={usePhoto}>
            <Text style={styles.useBtnText}>Use this photo</Text>
            <Feather name="arrow-right" size={16} color="#fff" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Uploading ──────────────────────────────────────────

  if (screen === "uploading") {
    return (
      <View style={styles.bg}>
        {capturedUri && (
          <Image
            source={{ uri: capturedUri }}
            style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}
            contentFit="contain"
          />
        )}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.uploadLabel}>
            {uploadProgress < 100 ? "Uploading page…" : "Saving…"}
          </Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressBar,
                { width: `${uploadProgress}%` },
              ]}
            />
          </View>
          <Text style={styles.progressPct}>{uploadProgress}%</Text>
        </View>
      </View>
    );
  }

  // ── Batch uploading ────────────────────────────────────

  if (screen === "batch_uploading") {
    return (
      <View style={styles.bg}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.uploadLabel}>
            Uploading {batchProgress.current} of {batchProgress.total}…
          </Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressBar,
                { width: batchProgress.total > 0 ? `${(batchProgress.current / batchProgress.total) * 100}%` : "0%" },
              ]}
            />
          </View>
          <Text style={styles.progressPct}>
            {batchProgress.total > 0 ? Math.round((batchProgress.current / batchProgress.total) * 100) : 0}%
          </Text>
        </View>
      </View>
    );
  }

  return <View style={styles.bg} />;
}

// ── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: "#000",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },

  // ── Vignette / frame ──────────────────────────────────
  vignette: {
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  frame: {
    position: "absolute",
    borderColor: "transparent",
  },

  // ── Corner brackets ───────────────────────────────────
  corner: {
    position: "absolute",
    width: BRACKET,
    height: BRACKET,
  },
  bracketArm: {
    position: "absolute",
    backgroundColor: "#fff",
    borderRadius: 1.5,
  },
  bracketH: {
    width: BRACKET,
    height: BRACKET_T,
  },
  bracketV: {
    width: BRACKET_T,
    height: BRACKET,
  },

  // ── Instruction text ──────────────────────────────────
  instructionWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  instruction: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    letterSpacing: 0.3,
    backgroundColor: "rgba(0,0,0,0.3)",
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    overflow: "hidden",
  },

  // ── Top bar ───────────────────────────────────────────
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  iconBtn: {
    alignItems: "center",
    gap: 2,
    minWidth: 44,
  },
  flashLabel: {
    fontSize: 10,
    letterSpacing: 0.3,
  },

  // ── Done button ───────────────────────────────────────
  doneBtn: {
    position: "absolute",
    right: 20,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  doneBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#1a1a1a",
  },

  // ── Batch badge ───────────────────────────────────────
  batchBadge: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 10,
    textAlign: "center",
  },

  // ── Library button ────────────────────────────────────
  libraryBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Bottom controls ───────────────────────────────────
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 40,
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff",
  },

  // ── Preview ───────────────────────────────────────────
  warningBanner: {
    position: "absolute",
    left: 20,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 10,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  errorBanner: {
    backgroundColor: "rgba(180,30,30,0.8)",
  },
  warningText: {
    color: "#fff",
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  previewClose: {
    position: "absolute",
    left: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewActions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    gap: 14,
  },
  retakeBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.6)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  retakeBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "500",
  },
  useBtn: {
    flex: 1.4,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  useBtnText: {
    color: "#111",
    fontSize: 15,
    fontWeight: "600",
  },

  // ── Upload progress ───────────────────────────────────
  uploadLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },
  progressTrack: {
    width: 220,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "#fff",
  },
  progressPct: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },

  // ── Permission screen ─────────────────────────────────
  permTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 10,
    textAlign: "center",
  },
  permDesc: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 28,
    maxWidth: 300,
  },
  permBtn: {
    backgroundColor: "#fff",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  permBtnText: {
    color: "#111",
    fontSize: 15,
    fontWeight: "600",
  },
  permBack: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 14,
  },
});
