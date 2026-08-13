import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { decode } from "base64-arraybuffer";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

// ── Constants ───────────────────────────────────────────────

const TITLE_MAX = 60;
const H_PAD = 20;
const SWATCH_GAP = 12;

const COVER_COLORS = [
  { id: "sand", hex: "#c8b89a" },
  { id: "taupe", hex: "#b8a898" },
  { id: "sage", hex: "#a8b8a0" },
  { id: "lavender", hex: "#b8b0c8" },
  { id: "terra", hex: "#c4a090" },
  { id: "slate", hex: "#98a8b8" },
  { id: "olive", hex: "#b0b898" },
  { id: "mauve", hex: "#a89898" },
] as const;

// ── Screen ──────────────────────────────────────────────────

export default function NewJournalScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [selectedColor, setSelectedColor] = useState<string>(COVER_COLORS[0].hex);

  // §2: Apply saved default cover color on mount
  useEffect(() => {
    AsyncStorage.getItem("margin:settings").then((raw) => {
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (prefs.coverColor) setSelectedColor(prefs.coverColor);
    });
  }, []);

  const [photoCoverUri, setPhotoCoverUri] = useState<string | null>(null);
  const [coverIsPhoto, setCoverIsPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate swatch size: 4 per row with gap
  // Real width is unknown at this point, estimate 375 – 2*20 = 335
  const { width: SCREEN_W } = useWindowDimensions();
  const swatchSize = (SCREEN_W - H_PAD * 2 - SWATCH_GAP * 3) / 4;

  const pickPhoto = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Photo library access is required to choose a cover photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.7,
    });
    if (!result.canceled) {
      setPhotoCoverUri(result.assets[0].uri);
      setCoverIsPhoto(true);
      setSelectedColor("");
    }
  }, []);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Not authenticated");

      const journalId = Crypto.randomUUID();
      let coverImagePath: string | null = null;

      if (coverIsPhoto && photoCoverUri) {
        const base64 = await FileSystem.readAsStringAsync(photoCoverUri, {
          encoding: "base64",
        });
        const storagePath = `${user.id}/${journalId}/cover.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("covers")
          .upload(storagePath, decode(base64), {
            contentType: "image/jpeg",
            upsert: false,
          });
        if (uploadError) throw uploadError;
        coverImagePath = storagePath;
      }

      const { error: insertError } = await supabase.from("journals").insert({
        id: journalId,
        user_id: user.id,
        title: title.trim(),
        cover_style: coverIsPhoto ? "image" : "solid",
        cover_color: coverIsPhoto ? null : selectedColor,
        cover_image_url: coverImagePath,
      });

      if (insertError) throw insertError;

      // Navigate to capture screen so user can start adding pages immediately
      router.replace({
        pathname: "/capture",
        params: { journal_id: journalId },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      setSaving(false);
    }
  }, [title, coverIsPhoto, photoCoverUri, selectedColor, router]);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.root, { paddingTop: insets.top || 16 }]}>
      {/* Header */}
      <View style={styles.header}>
        {step === 2 ? (
          <Pressable onPress={() => setStep(1)} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>← Title</Text>
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
        <Text style={styles.headerTitle}>New Journal</Text>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Text style={[styles.headerBtnText, { textAlign: "right" }]}>✕</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 ? (
          /* ── Step 1: Title ─────────────────────────────────── */
          <>
            <Text style={styles.prompt}>What should we call it?</Text>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={(t) => setTitle(t.slice(0, TITLE_MAX))}
              placeholder="My Journal"
              placeholderTextColor={colors.border}
              returnKeyType="next"
              autoFocus
              onSubmitEditing={() => {
                if (title.trim()) setStep(2);
              }}
            />
            <Text style={styles.charCount}>
              {title.length}/{TITLE_MAX}
            </Text>
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                !title.trim() && styles.primaryBtnDisabled,
              ]}
              onPress={() => setStep(2)}
              disabled={!title.trim()}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Next →</Text>
            </TouchableOpacity>
          </>
        ) : (
          /* ── Step 2: Cover ─────────────────────────────────── */
          <>
            <Text style={styles.prompt}>Choose a cover</Text>

            {/* Color swatches */}
            <View style={styles.swatchGrid}>
              {COVER_COLORS.map((c) => (
                <Pressable
                  key={c.id}
                  style={[
                    styles.swatch,
                    {
                      width: swatchSize,
                      height: swatchSize,
                      backgroundColor: c.hex,
                      borderWidth: selectedColor === c.hex && !coverIsPhoto ? 3 : 0,
                      borderColor: colors.foreground,
                    },
                  ]}
                  onPress={() => {
                    setSelectedColor(c.hex);
                    setCoverIsPhoto(false);
                    setPhotoCoverUri(null);
                  }}
                >
                  {selectedColor === c.hex && !coverIsPhoto && (
                    <Text style={styles.swatchCheck}>✓</Text>
                  )}
                </Pressable>
              ))}
            </View>

            {/* Photo option */}
            <Pressable
              style={[
                styles.photoOption,
                coverIsPhoto && { borderColor: colors.primary, borderWidth: 2 },
              ]}
              onPress={pickPhoto}
            >
              {photoCoverUri ? (
                <Image
                  source={{ uri: photoCoverUri }}
                  style={styles.photoPreview}
                  resizeMode="cover"
                />
              ) : (
                <Text style={styles.photoOptionText}>📷  Choose from photos</Text>
              )}
            </Pressable>

            {error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
              style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
              onPress={handleCreate}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Create journal</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: H_PAD,
      paddingBottom: 16,
    },
    headerBtn: {
      width: 70,
    },
    headerBtnText: {
      fontSize: 15,
      color: colors.primary,
      fontFamily: "Inter_500Medium",
    },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      fontSize: 17,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    content: {
      paddingHorizontal: H_PAD,
      paddingBottom: 40,
    },
    prompt: {
      fontSize: 24,
      fontFamily: "PlayfairDisplay_700Bold",
      color: colors.foreground,
      marginBottom: 24,
      marginTop: 8,
    },
    titleInput: {
      fontSize: 22,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      borderBottomWidth: 2,
      borderBottomColor: colors.primary,
      paddingVertical: 12,
      marginBottom: 8,
    },
    charCount: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.border,
      textAlign: "right",
      marginBottom: 32,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 8,
    },
    primaryBtnDisabled: {
      opacity: 0.4,
    },
    primaryBtnText: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: "#fff",
    },
    swatchGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: SWATCH_GAP,
      marginBottom: 20,
    },
    swatch: {
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    swatchCheck: {
      fontSize: 20,
      color: "#fff",
      fontWeight: "bold",
    },
    photoOption: {
      height: 80,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderStyle: "dashed",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      marginBottom: 24,
    },
    photoOptionText: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    photoPreview: {
      width: "100%",
      height: "100%",
    },
    errorText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.destructive,
      marginBottom: 12,
      textAlign: "center",
    },
  });
}
