import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import * as LocalAuthentication from "expo-local-authentication";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  type DimensionValue,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useTheme, type ThemeOption } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";

// ─── Reusable primitives ─────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  const colors = useColors();
  return (
    <Text
      style={[
        styles.sectionHeader,
        { color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
      ]}
    >
      {label}
    </Text>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      {children}
    </View>
  );
}

function Divider() {
  const colors = useColors();
  return (
    <View style={[styles.divider, { backgroundColor: colors.border }]} />
  );
}

interface RowProps {
  icon: React.ComponentProps<typeof Feather>["name"];
  iconColor?: string;
  label: string;
  value?: string;
  destructive?: boolean;
  chevron?: boolean;
  rightElement?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}

function Row({
  icon,
  iconColor,
  label,
  value,
  destructive,
  chevron = true,
  rightElement,
  onPress,
  last,
}: RowProps) {
  const colors = useColors();
  const labelColor = destructive ? colors.destructive : colors.foreground;
  const ic = iconColor ?? (destructive ? colors.destructive : colors.primary);

  return (
    <>
      <TouchableOpacity
        style={styles.row}
        onPress={() => {
          Haptics.selectionAsync();
          onPress?.();
        }}
        activeOpacity={onPress ? 0.6 : 1}
      >
        {/* Icon badge */}
        <View
          style={[
            styles.iconBadge,
            {
              backgroundColor: destructive
                ? colors.destructive + "18"
                : ic + "18",
            },
          ]}
        >
          <Feather name={icon} size={15} color={ic} />
        </View>

        {/* Label */}
        <Text
          style={[
            styles.rowLabel,
            { color: labelColor, fontFamily: "Inter_400Regular" },
          ]}
        >
          {label}
        </Text>

        {/* Right side */}
        <View style={styles.rowRight}>
          {value ? (
            <Text
              style={[
                styles.rowValue,
                { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
              ]}
            >
              {value}
            </Text>
          ) : null}
          {rightElement ?? null}
          {chevron && !rightElement ? (
            <Feather
              name="chevron-right"
              size={16}
              color={colors.mutedForeground}
            />
          ) : null}
        </View>
      </TouchableOpacity>
      {!last && <Divider />}
    </>
  );
}

function ToggleRow({
  icon,
  iconColor,
  label,
  value,
  onChange,
  last,
}: {
  icon: string;
  iconColor?: string;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  const colors = useColors();
  return (
    <Row
      icon={icon as React.ComponentProps<typeof Feather>["name"]}
      iconColor={iconColor}
      label={label}
      chevron={false}
      last={last}
      rightElement={
        <Switch
          value={value}
          onValueChange={(v) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onChange(v);
          }}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
          ios_backgroundColor={colors.border}
        />
      }
    />
  );
}

// ─── Theme picker ─────────────────────────────────────────────────────────────

function ThemeRow({ value, onChange }: { value: ThemeOption; onChange: (v: ThemeOption) => void }) {
  const colors = useColors();
  const options: { key: ThemeOption; label: string }[] = [
    { key: "light", label: "Light" },
    { key: "dark", label: "Dark" },
    { key: "system", label: "System" },
  ];

  return (
    <>
      <View style={styles.row}>
        <View
          style={[styles.iconBadge, { backgroundColor: colors.primary + "18" }]}
        >
          <Feather name="sun" size={15} color={colors.primary} />
        </View>
        <Text
          style={[
            styles.rowLabel,
            { color: colors.foreground, fontFamily: "Inter_400Regular" },
          ]}
        >
          Theme
        </Text>
        <View style={styles.rowRight}>
          <View
            style={[
              styles.segmented,
              { backgroundColor: colors.muted, borderColor: colors.border },
            ]}
          >
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.segmentedOption,
                  value === opt.key && {
                    backgroundColor: colors.card,
                    shadowColor: "#4a3f35",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                    elevation: 2,
                    ...(Platform.OS === "web"
                      ? { boxShadow: "0 1px 3px rgba(74,63,53,0.12)" }
                      : {}),
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  onChange(opt.key);
                }}
              >
                <Text
                  style={[
                    styles.segmentedLabel,
                    {
                      color:
                        value === opt.key
                          ? colors.foreground
                          : colors.mutedForeground,
                      fontFamily:
                        value === opt.key
                          ? "Inter_600SemiBold"
                          : "Inter_400Regular",
                    },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
      <Divider />
    </>
  );
}

// ─── Cover color picker ───────────────────────────────────────────────────────

const COVER_COLORS = [
  "#c8b89a",
  "#a8b8a0",
  "#b8b0c8",
  "#b8c4b0",
  "#c0a898",
  "#a8b0b8",
];

function CoverColorRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  const colors = useColors();
  return (
    <>
      <View style={[styles.row, { alignItems: "flex-start", paddingVertical: 14 }]}>
        <View
          style={[styles.iconBadge, { backgroundColor: colors.primary + "18", marginTop: 2 }]}
        >
          <Feather name="droplet" size={15} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.rowLabel,
              { color: colors.foreground, fontFamily: "Inter_400Regular", marginBottom: 12 },
            ]}
          >
            Default cover color
          </Text>
          <View style={styles.swatchRow}>
            {COVER_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.swatch,
                  { backgroundColor: c },
                  value === c && {
                    borderWidth: 2.5,
                    borderColor: colors.primary,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  onChange(c);
                }}
              />
            ))}
          </View>
        </View>
      </View>
    </>
  );
}

// ─── Storage bar ──────────────────────────────────────────────────────────────

function StorageRow() {
  const colors = useColors();
  const [usedBytes, setUsedBytes] = useState<number | null>(null);
  const TOTAL_GB = 15;

  useEffect(() => {
    supabase
      .rpc("get_user_storage_bytes")
      .then(({ data }) => {
        if (data !== null && data !== undefined) {
          setUsedBytes(data as number);
        }
      });
  }, []);

  const usedGB = usedBytes !== null ? usedBytes / (1024 ** 3) : null;
  const displayUsed = usedGB !== null ? usedGB.toFixed(2) : "…";
  const pct = usedGB !== null ? Math.min(usedGB / TOTAL_GB, 1) : 0;
  const available = usedGB !== null ? (TOTAL_GB - usedGB).toFixed(1) : "…";

  return (
    <>
      <View style={[styles.row, { alignItems: "flex-start", paddingVertical: 14 }]}>
        <View
          style={[styles.iconBadge, { backgroundColor: colors.primary + "18", marginTop: 2 }]}
        >
          <Feather name="hard-drive" size={15} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.storageLabelRow}>
            <Text
              style={[
                styles.rowLabel,
                { color: colors.foreground, fontFamily: "Inter_400Regular" },
              ]}
            >
              Storage used
            </Text>
            <Text
              style={[
                styles.storageNumbers,
                { color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
              ]}
            >
              {displayUsed} GB / {TOTAL_GB} GB
            </Text>
          </View>
          <View
            style={[styles.storageTrack, { backgroundColor: colors.muted }]}
          >
            <View
              style={[
                styles.storageFill,
                {
                  width: `${pct * 100}%` as DimensionValue,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>
          <Text
            style={[
              styles.storageSub,
              { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
            ]}
          >
            {available} GB available · photos &amp; pages
          </Text>
        </View>
      </View>
      <Divider />
    </>
  );
}

// ─── Preferences ─────────────────────────────────────────────────────────────

const PREFS_KEY = "margin:settings";

type TranscriptionQuality = "balanced" | "best";

type Prefs = {
  dailyReminder: boolean;
  onThisDay: boolean;
  weeklyDigest: boolean;
  iCloudBackup: boolean;
  driveBackup: boolean;
  appLock: boolean;
  coverColor: string;
  transcriptionQuality: TranscriptionQuality;
};

const DEFAULT_PREFS: Prefs = {
  dailyReminder: true,
  onThisDay: true,
  weeklyDigest: false,
  iCloudBackup: true,
  driveBackup: false,
  appLock: false,
  coverColor: COVER_COLORS[0],
  transcriptionQuality: "balanced",
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const colors = useColors();
  const { theme, setTheme: setThemeGlobal } = useTheme();
  const insets = useSafeAreaInsets();

  const pt = Platform.OS === "web" ? 67 : insets.top;
  const pb = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  // User identity
  const [userEmail, setUserEmail] = useState("");
  const [displayName, setDisplayName] = useState("");

  // Preferences
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [dailyReminder, setDailyReminder] = useState(DEFAULT_PREFS.dailyReminder);
  const [onThisDay, setOnThisDay] = useState(DEFAULT_PREFS.onThisDay);
  const [weeklyDigest, setWeeklyDigest] = useState(DEFAULT_PREFS.weeklyDigest);
  const [iCloudBackup, setICloudBackup] = useState(DEFAULT_PREFS.iCloudBackup);
  const [driveBackup, setDriveBackup] = useState(DEFAULT_PREFS.driveBackup);
  const [appLock, setAppLock] = useState(DEFAULT_PREFS.appLock);
  const [coverColor, setCoverColor] = useState(DEFAULT_PREFS.coverColor);
  const [transcriptionQuality, setTranscriptionQuality] = useState<TranscriptionQuality>(
    DEFAULT_PREFS.transcriptionQuality,
  );

  // §5: Change password modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  // §8: Cache size
  const [cacheSize, setCacheSize] = useState("...");

  // Load user session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      const email = session.user.email ?? "";
      const name =
        (session.user.user_metadata?.full_name as string | undefined) ??
        email.split("@")[0];
      setUserEmail(email);
      setDisplayName(name);
    });
  }, []);

  // Load persisted preferences
  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY).then((raw) => {
      if (raw) {
        const stored: Partial<Prefs> = JSON.parse(raw);
        if (stored.dailyReminder !== undefined) setDailyReminder(stored.dailyReminder);
        if (stored.onThisDay !== undefined) setOnThisDay(stored.onThisDay);
        if (stored.weeklyDigest !== undefined) setWeeklyDigest(stored.weeklyDigest);
        if (stored.iCloudBackup !== undefined) setICloudBackup(stored.iCloudBackup);
        if (stored.driveBackup !== undefined) setDriveBackup(stored.driveBackup);
        if (stored.appLock !== undefined) setAppLock(stored.appLock);
        if (stored.coverColor !== undefined) setCoverColor(stored.coverColor);
        if (stored.transcriptionQuality !== undefined)
          setTranscriptionQuality(stored.transcriptionQuality);
      }
      setPrefsLoaded(true);
    });
  }, []);

  // §8: Measure cache size on mount
  useEffect(() => {
    if (!FileSystem.cacheDirectory) return;
    FileSystem.getInfoAsync(FileSystem.cacheDirectory).then((info) => {
      if (info.exists && "size" in info && info.size) {
        const mb = info.size / 1024 / 1024;
        setCacheSize(mb < 1 ? `${(info.size / 1024).toFixed(0)} KB` : `${mb.toFixed(0)} MB`);
      } else {
        setCacheSize("0 MB");
      }
    });
  }, []);

  function savePref(patch: Partial<Prefs>) {
    const current: Prefs = {
      dailyReminder, onThisDay, weeklyDigest,
      iCloudBackup, driveBackup, appLock, coverColor, transcriptionQuality,
    };
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, ...patch }));
  }

  // ── §4: App lock ──────────────────────────────────────────────────────────

  async function handleAppLockChange(v: boolean) {
    if (v) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        Alert.alert("Not available", "No biometrics are enrolled on this device.");
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Enable app lock",
        fallbackLabel: "Use passcode",
      });
      if (!result.success) return;
    }
    setAppLock(v);
    savePref({ appLock: v });
  }

  // ── §5: Change password ───────────────────────────────────────────────────

  async function handleChangePassword() {
    if (newPassword.length < 8) {
      Alert.alert("Too short", "Password must be at least 8 characters.");
      return;
    }
    setPasswordLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordLoading(false);
    if (error) {
      Alert.alert("Error", error.message);
    } else {
      Alert.alert("Done", "Your password has been updated.");
      setNewPassword("");
      setShowPasswordModal(false);
    }
  }

  // ── §7: Export full archive ───────────────────────────────────────────────

  async function handleExport() {
    Alert.alert(
      "Export archive",
      "Creates a text file with all journal transcriptions.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Export",
          onPress: async () => {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) return;

              const { data: pages } = await supabase
                .from("pages")
                .select("page_number, transcription_text, journals!inner(title, user_id)")
                .eq("journals.user_id", session.user.id)
                .order("page_number");

              if (!pages?.length) {
                Alert.alert("Nothing to export", "You have no journal pages yet.");
                return;
              }

              let content = "Margin — Journal Export\n";
              content += `Exported: ${new Date().toLocaleDateString()}\n\n`;
              for (const page of pages) {
                content += `--- Page ${page.page_number} ---\n`;
                content += (page.transcription_text ?? "(no transcription yet)") + "\n\n";
              }

              const dir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? "";
              const filePath = dir + "margin_export.txt";
              await FileSystem.writeAsStringAsync(filePath, content);

              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(filePath, {
                  mimeType: "text/plain",
                  UTI: "public.plain-text",
                });
              } else {
                Alert.alert("Sharing not available", "Your device doesn't support sharing files.");
              }
            } catch (e) {
              Alert.alert("Export failed", e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  }

  // ── §8: Clear cached images ───────────────────────────────────────────────

  async function handleClearCache() {
    Alert.alert(
      "Clear cache",
      "Removes cached image data. Your journals and transcriptions are unaffected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            if (FileSystem.cacheDirectory) {
              // Android doesn't allow deleting the cache root itself; delete contents instead
              const entries = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
              await Promise.all(
                entries.map((name) =>
                  FileSystem.deleteAsync(FileSystem.cacheDirectory! + name, { idempotent: true })
                )
              );
            }
            setCacheSize("0 MB");
          },
        },
      ],
    );
  }

  // ── Notification helpers ──────────────────────────────────────────────────

  async function requestNotificationPermission(): Promise<boolean> {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  }

  async function scheduleDaily(
    identifier: string,
    hour: number,
    minute: number,
    title: string,
    body: string,
  ) {
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title, body, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  }

  // ── Sign out ──────────────────────────────────────────────────────────────

  function handleSignOut() {
    Alert.alert(
      "Sign out",
      "You'll need to sign in again to access your journals.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            await supabase.auth.signOut();
            router.replace("/");
          },
        },
      ]
    );
  }

  if (!prefsLoaded) return <View style={[styles.root, { backgroundColor: colors.background }]} />;

  return (
    <>
      <ScrollView
        style={[styles.root, { backgroundColor: colors.background }]}
        contentContainerStyle={[
          styles.content,
          { paddingTop: pt + 16, paddingBottom: pb },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile header ── */}
        <View style={styles.profileHeader}>
          <View style={[styles.avatarLarge, { backgroundColor: colors.primary }]}>
            <Text
              style={[styles.avatarLargeText, { fontFamily: "Inter_700Bold" }]}
            >
              {displayName.charAt(0).toUpperCase() || "?"}
            </Text>
          </View>
          <Text
            style={[
              styles.profileName,
              { color: colors.foreground, fontFamily: "PlayfairDisplay_700Bold" },
            ]}
          >
            {displayName || userEmail}
          </Text>
          <Text
            style={[
              styles.profileEmail,
              { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
            ]}
          >
            {userEmail}
          </Text>
        </View>

        {/* ── Account ── */}
        <SectionHeader label="Account" />
        <SectionCard>
          <Row
            icon="lock"
            label="Change password"
            onPress={() => setShowPasswordModal(true)}
          />
          <Row
            icon="log-out"
            label="Sign out"
            destructive
            chevron={false}
            last
            onPress={handleSignOut}
          />
        </SectionCard>

        {/* ── Notifications ── */}
        <SectionHeader label="Notifications" />
        <SectionCard>
          <ToggleRow
            icon="bell"
            label="Daily writing reminder"
            value={dailyReminder}
            onChange={async (v) => {
              if (v) {
                const granted = await requestNotificationPermission();
                if (!granted) {
                  Alert.alert("Permission required", "Enable notifications in your device settings.");
                  return;
                }
                await scheduleDaily(
                  "margin:daily_reminder", 21, 0,
                  "Time to write ✍️", "Your journal is waiting.",
                );
              } else {
                await Notifications.cancelScheduledNotificationAsync("margin:daily_reminder").catch(() => {});
              }
              setDailyReminder(v);
              savePref({ dailyReminder: v });
            }}
          />
          {dailyReminder && (
            <>
              <Row
                icon="clock"
                label="Reminder time"
                value="9:00 PM"
                chevron={false}
                last={false}
              />
            </>
          )}
          <ToggleRow
            icon="calendar"
            label={"On this day"}
            value={onThisDay}
            onChange={async (v) => {
              if (v) {
                const granted = await requestNotificationPermission();
                if (!granted) {
                  Alert.alert("Permission required", "Enable notifications in your device settings.");
                  return;
                }
                await scheduleDaily(
                  "margin:on_this_day", 10, 0,
                  "On this day", "You wrote something worth revisiting a year ago.",
                );
              } else {
                await Notifications.cancelScheduledNotificationAsync("margin:on_this_day").catch(() => {});
              }
              setOnThisDay(v);
              savePref({ onThisDay: v });
              // Sync preference to push_tokens so the server-side digest respects it
              supabase
                .from("push_tokens")
                .update({ on_this_day_enabled: v })
                .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
                .then(() => {});
            }}
          />
          {onThisDay && (
            <View style={styles.infoRow}>
              <Text
                style={[
                  styles.infoText,
                  { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
                ]}
              >
                Resurfaces a journal entry from exactly one year ago — a favourite feature of journalers.
              </Text>
            </View>
          )}
          <ToggleRow
            icon="mail"
            label="Weekly digest"
            value={weeklyDigest}
            onChange={async (v) => {
              if (v) {
                const granted = await requestNotificationPermission();
                if (!granted) {
                  Alert.alert("Permission required", "Enable notifications in your device settings.");
                  return;
                }
                await Notifications.cancelScheduledNotificationAsync("margin:weekly_digest").catch(() => {});
                await Notifications.scheduleNotificationAsync({
                  identifier: "margin:weekly_digest",
                  content: { title: "Your week in Margin", body: "See what you wrote this week.", sound: true },
                  trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
                    weekday: 1,
                    hour: 10,
                    minute: 0,
                  },
                });
              } else {
                await Notifications.cancelScheduledNotificationAsync("margin:weekly_digest").catch(() => {});
              }
              setWeeklyDigest(v);
              savePref({ weeklyDigest: v });
            }}
            last
          />
        </SectionCard>

        {/* ── Storage & Backup ── */}
        <SectionHeader label="Storage & Backup" />
        <SectionCard>
          <StorageRow />
          <ToggleRow
            icon="cloud"
            label="iCloud backup"
            value={iCloudBackup}
            onChange={(v) => { setICloudBackup(v); savePref({ iCloudBackup: v }); }}
          />
          <ToggleRow
            icon="cloud"
            iconColor="#4285F4"
            label="Google Drive backup"
            value={driveBackup}
            onChange={(v) => { setDriveBackup(v); savePref({ driveBackup: v }); }}
          />
          <Row
            icon="download"
            label="Export full archive"
            value="Text / PDF"
            onPress={handleExport}
          />
          <Row
            icon="trash-2"
            label="Clear cached images"
            value={cacheSize}
            last
            destructive
            onPress={handleClearCache}
          />
        </SectionCard>

        {/* ── Privacy & Security ── */}
        <SectionHeader label="Privacy & Security" />
        <SectionCard>
          <ToggleRow
            icon="shield"
            label="App lock (Face ID / Touch ID)"
            value={appLock}
            onChange={handleAppLockChange}
          />
          <Row
            icon="eye-off"
            label="Per-journal privacy"
            last
            onPress={() =>
              Alert.alert(
                "Per-journal privacy",
                "Open a journal, tap Edit, then tap the lock icon in the header to lock or unlock that journal. Locked journals require Face ID or Touch ID to open.",
              )
            }
          />
        </SectionCard>

        {/* ── Appearance ── */}
        <SectionHeader label="Appearance" />
        <SectionCard>
          <ThemeRow value={theme} onChange={(v) => setThemeGlobal(v)} />
          <CoverColorRow value={coverColor} onChange={(v) => { setCoverColor(v); savePref({ coverColor: v }); }} />
        </SectionCard>

        {/* ── Journaling ── */}
        <SectionHeader label="Journaling" />
        <SectionCard>
          <Row icon="settings" label="New journal defaults" />
          <Row
            icon="book-open"
            label="Glossary"
            onPress={() => router.push("/glossary")}
          />
          <Row
            icon="trash-2"
            label="Deleted Pages"
            onPress={() => router.push("/deleted-pages")}
          />
          <Row
            icon="cpu"
            label="AI transcription quality"
            value={transcriptionQuality.charAt(0).toUpperCase() + transcriptionQuality.slice(1)}
            last
            onPress={() => {
              const options: { key: TranscriptionQuality; label: string }[] = [
                { key: "balanced", label: "Balanced — default" },
                { key: "best", label: "Best — highest accuracy" },
              ];
              Alert.alert(
                "Transcription quality",
                "Affects how carefully Gemini reads your handwriting.",
                [
                  ...options.map((o) => ({
                    text: o.label + (o.key === transcriptionQuality ? " ✓" : ""),
                    onPress: () => {
                      setTranscriptionQuality(o.key);
                      savePref({ transcriptionQuality: o.key });
                    },
                  })),
                  { text: "Cancel", style: "cancel" as const },
                ],
              );
            }}
          />
        </SectionCard>

        {/* ── App ── */}
        <SectionHeader label="App" />
        <SectionCard>
          <Row
            icon="star"
            label="Rate Margin"
            onPress={() =>
              Linking.openURL("https://apps.apple.com/app/idTODO").catch(() =>
                Alert.alert("Not available yet", "The App Store page will be live after launch.")
              )
            }
          />
          <Row
            icon="message-circle"
            label="Send feedback"
            onPress={() =>
              Linking.openURL("mailto:songdavid93374@gmail.com?subject=Margin%20Feedback")
            }
          />
          <Row
            icon="info"
            label="Version"
            value="1.0.0"
            chevron={false}
            last
          />
        </SectionCard>
      </ScrollView>

      {/* ── §5: Change password modal ── */}
      <Modal
        visible={showPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              Change password
            </Text>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password (min 8 characters)"
              secureTextEntry
              autoFocus
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.modalInput,
                { color: colors.foreground, borderColor: colors.border, fontFamily: "Inter_400Regular" },
              ]}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => { setShowPasswordModal(false); setNewPassword(""); }}
                style={styles.modalCancelBtn}
              >
                <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleChangePassword}
                disabled={passwordLoading}
                style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }]}
              >
                {passwordLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Update</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20 },

  profileHeader: {
    alignItems: "center",
    marginBottom: 28,
    gap: 6,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  avatarLargeText: { color: "#fff", fontSize: 32 },
  profileName: { fontSize: 24, letterSpacing: -0.3 },
  profileEmail: { fontSize: 14, opacity: 0.75 },

  sectionHeader: {
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    marginBottom: 8,
    marginLeft: 4,
    marginTop: 20,
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },

  divider: { height: StyleSheet.hairlineWidth, marginLeft: 52 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 50,
    gap: 12,
  },
  iconBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, fontSize: 15 },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowValue: { fontSize: 14 },

  infoRow: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingLeft: 56,
    marginTop: -4,
  },
  infoText: {
    fontSize: 12,
    lineHeight: 17,
    fontStyle: "italic",
  },

  segmented: {
    flexDirection: "row",
    borderRadius: 8,
    borderWidth: 1,
    padding: 2,
    gap: 2,
  },
  segmentedOption: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  segmentedLabel: { fontSize: 12 },

  swatchRow: { flexDirection: "row", gap: 10 },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },

  storageLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  storageNumbers: { fontSize: 12 },
  storageTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 6,
  },
  storageFill: { height: 6, borderRadius: 3 },
  storageSub: { fontSize: 11, opacity: 0.8 },

  // ── §5: Password modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  modalTitle: { fontSize: 17 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  modalConfirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    minWidth: 80,
  },
});
