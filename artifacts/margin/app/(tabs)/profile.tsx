import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
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
  icon: string;
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
          <Feather name={icon as any} size={15} color={ic} />
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
      icon={icon}
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

type ThemeOption = "light" | "dark" | "system";

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
  const used = 2.4;
  const total = 15;
  const pct = used / total;

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
              {used} GB / {total} GB
            </Text>
          </View>
          <View
            style={[styles.storageTrack, { backgroundColor: colors.muted }]}
          >
            <View
              style={[
                styles.storageFill,
                {
                  width: `${pct * 100}%` as any,
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
            {((total - used)).toFixed(1)} GB available · photos &amp; pages
          </Text>
        </View>
      </View>
      <Divider />
    </>
  );
}

// ─── Preferences ─────────────────────────────────────────────────────────────

const PREFS_KEY = "margin:settings";

type Prefs = {
  dailyReminder: boolean;
  onThisDay: boolean;
  weeklyDigest: boolean;
  iCloudBackup: boolean;
  driveBackup: boolean;
  appLock: boolean;
  theme: ThemeOption;
  coverColor: string;
};

const DEFAULT_PREFS: Prefs = {
  dailyReminder: true,
  onThisDay: true,
  weeklyDigest: false,
  iCloudBackup: true,
  driveBackup: false,
  appLock: false,
  theme: "system",
  coverColor: COVER_COLORS[0],
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const colors = useColors();
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
  const [theme, setTheme] = useState<ThemeOption>(DEFAULT_PREFS.theme);
  const [coverColor, setCoverColor] = useState(DEFAULT_PREFS.coverColor);

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
        if (stored.theme !== undefined) setTheme(stored.theme);
        if (stored.coverColor !== undefined) setCoverColor(stored.coverColor);
      }
      setPrefsLoaded(true);
    });
  }, []);

  function savePref(patch: Partial<Prefs>) {
    const current: Prefs = {
      dailyReminder, onThisDay, weeklyDigest,
      iCloudBackup, driveBackup, appLock, theme, coverColor,
    };
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, ...patch }));
  }

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
        <Row icon="lock" label="Change password" />
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
          onChange={(v) => { setDailyReminder(v); savePref({ dailyReminder: v }); }}
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
          onChange={(v) => { setOnThisDay(v); savePref({ onThisDay: v }); }}
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
          onChange={(v) => { setWeeklyDigest(v); savePref({ weeklyDigest: v }); }}
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
        <Row icon="download" label="Export full archive" value="ZIP / PDF" />
        <Row
          icon="trash-2"
          label="Clear cached images"
          value="340 MB"
          last
          destructive
        />
      </SectionCard>

      {/* ── Privacy & Security ── */}
      <SectionHeader label="Privacy & Security" />
      <SectionCard>
        <ToggleRow
          icon="shield"
          label="App lock (Face ID / Touch ID)"
          value={appLock}
          onChange={(v) => { setAppLock(v); savePref({ appLock: v }); }}
        />
        <Row icon="eye-off" label="Per-journal privacy" last />
      </SectionCard>

      {/* ── Appearance ── */}
      <SectionHeader label="Appearance" />
      <SectionCard>
        <ThemeRow value={theme} onChange={(v) => { setTheme(v); savePref({ theme: v }); }} />
        <CoverColorRow value={coverColor} onChange={(v) => { setCoverColor(v); savePref({ coverColor: v }); }} />
      </SectionCard>

      {/* ── Journaling ── */}
      <SectionHeader label="Journaling" />
      <SectionCard>
        <Row icon="settings" label="New journal defaults" />
        <Row
          icon="cpu"
          label="AI transcription quality"
          value="Balanced"
          last
        />
      </SectionCard>

      {/* ── App ── */}
      <SectionHeader label="App" />
      <SectionCard>
        <Row icon="star" label="Rate Margin" />
        <Row icon="message-circle" label="Send feedback" />
        <Row icon="help-circle" label="Help & FAQ" />
        <Row
          icon="info"
          label="Version"
          value="1.0.0"
          chevron={false}
          last
        />
      </SectionCard>
    </ScrollView>
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
});
