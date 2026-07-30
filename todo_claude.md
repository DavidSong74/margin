# Margin — Claude TODO

All items below are persistence stubs from the settings/profile tab: they save a value to AsyncStorage
but nothing reads that value to change actual app behavior. Implement in order — the theme system
(#1) should be done first since it touches shared infrastructure.

Search for `TODO for you` to find every decision that needs your taste or a real URL/value.

---

## 1. Theme system (light / dark / system)

**What it does:** Wires the theme toggle in profile.tsx so choosing Light, Dark, or System actually
changes the app's colors.

**The gap:** `useColors()` calls React Native's `useColorScheme()` directly — it always returns
the device OS setting regardless of what's saved in AsyncStorage. Also, `constants/colors.ts` has no
`dark` palette, so dark mode would show the light palette even if the OS is dark.

**Files to modify:**
- `artifacts/margin/constants/colors.ts`
- `artifacts/margin/hooks/useColors.ts`
- `artifacts/margin/hooks/useTheme.ts` (new file)
- `artifacts/margin/app/_layout.tsx`
- `artifacts/margin/app/(tabs)/profile.tsx`

---

### Step 1 — Define the dark palette in constants/colors.ts

> **TODO for you:** Fill in all 18 hex values below. Current light values are shown as comments
> so you can decide the dark equivalents. The two palettes must have the same keys.

Find:
```ts
  radius: 12,
};
```
Change to:
```ts
  dark: {
    text: "#TODO",               // light: "#4a3f35"
    tint: "#TODO",               // light: "#7d9b76"

    background: "#TODO",         // light: "#faf7f2"
    foreground: "#TODO",         // light: "#4a3f35"

    card: "#TODO",               // light: "#fffdf9"
    cardForeground: "#TODO",     // light: "#4a3f35"

    primary: "#TODO",            // light: "#7d9b76"
    primaryForeground: "#TODO",  // light: "#ffffff"

    secondary: "#TODO",          // light: "#f0ece4"
    secondaryForeground: "#TODO",// light: "#4a3f35"

    muted: "#TODO",              // light: "#f0ece4"
    mutedForeground: "#TODO",    // light: "#8c7d72"

    accent: "#TODO",             // light: "#7d9b76"
    accentForeground: "#TODO",   // light: "#ffffff"

    destructive: "#TODO",        // light: "#b05c4a"
    destructiveForeground: "#TODO", // light: "#ffffff"

    border: "#TODO",             // light: "#e8e0d4"
    input: "#TODO",              // light: "#e8e0d4"
  },

  radius: 12,
};
```

---

### Step 2 — Create hooks/useTheme.ts (new file)

Create `artifacts/margin/hooks/useTheme.ts` with this content:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeOption = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: ThemeOption;
  setTheme: (t: ThemeOption) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
});

const PREFS_KEY = "margin:settings";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeOption>("system");

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY).then((raw) => {
      if (!raw) return;
      const stored = JSON.parse(raw);
      if (stored.theme) setThemeState(stored.theme);
    });
  }, []);

  const setTheme = useCallback((t: ThemeOption) => {
    setThemeState(t);
    AsyncStorage.getItem(PREFS_KEY).then((raw) => {
      const current = raw ? JSON.parse(raw) : {};
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, theme: t }));
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

---

### Step 3 — Update hooks/useColors.ts

Replace the entire file contents with:

```ts
import { useColorScheme } from "react-native";
import colors from "@/constants/colors";
import { useTheme } from "@/hooks/useTheme";

export function useColors() {
  const { theme } = useTheme();
  const systemScheme = useColorScheme();

  const resolved = theme === "system" ? systemScheme : theme;
  const palette = resolved === "dark" && colors.dark ? colors.dark : colors.light;
  return { ...palette, radius: colors.radius };
}
```

---

### Step 4 — Wrap the app in ThemeProvider (app/_layout.tsx)

Add import:
```tsx
import { ThemeProvider } from "@/hooks/useTheme";
```

Find the outermost JSX element in the root layout return and wrap it:
```tsx
return (
  <ThemeProvider>
    {/* existing root element unchanged */}
  </ThemeProvider>
);
```

---

### Step 5 — Wire profile.tsx ThemeRow to the context

In `profile.tsx`, add the import:
```tsx
import { useTheme, type ThemeOption } from "@/hooks/useTheme";
```

Inside `ProfileScreen`, find:
```tsx
const [theme, setTheme] = useState<ThemeOption>(DEFAULT_PREFS.theme);
```
Replace with:
```tsx
const { theme, setTheme: setThemeGlobal } = useTheme();
```

Remove `theme` from the `Prefs` type, `DEFAULT_PREFS`, and the `savePref` current object, since
persistence is now handled by `ThemeProvider`.

Find the ThemeRow usage:
```tsx
<ThemeRow value={theme} onChange={(v) => { setTheme(v); savePref({ theme: v }); }} />
```
Change to:
```tsx
<ThemeRow value={theme} onChange={(v) => setThemeGlobal(v)} />
```

Also remove the standalone `type ThemeOption = "light" | "dark" | "system"` declaration near the
top of profile.tsx (it's now imported from useTheme).

---

## 2. Default cover color for new journals

**What it does:** Pre-selects the user's preferred cover color on the new journal screen so they
don't have to pick it every time.

**The gap:** `coverColor` is saved to AsyncStorage, but `app/journal/new.tsx` always initializes
`selectedColor` to `COVER_COLORS[0].hex` (line 48) and never reads the saved pref.

**File to modify:** `artifacts/margin/app/journal/new.tsx`

---

### Step 1 — Add AsyncStorage import

At the top of `new.tsx`, add:
```tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
```
Also add `useEffect` to the React import if it's not already there.

---

### Step 2 — Read pref on mount

After the `selectedColor` useState declaration (line 48), add:

```tsx
useEffect(() => {
  AsyncStorage.getItem("margin:settings").then((raw) => {
    if (!raw) return;
    const prefs = JSON.parse(raw);
    if (prefs.coverColor && !coverIsPhoto) {
      setSelectedColor(prefs.coverColor);
    }
  });
}, []);
```

Reason: Only apply the saved default when the user hasn't already chosen a photo cover. Runs once
on mount before the user interacts with the picker.

---

## 3. Notifications — daily reminder, on this day, weekly digest

**What it does:** Wires the three notification toggles to actually schedule and cancel local push
notifications.

**The gap:** All three toggles write to AsyncStorage but never call expo-notifications.
`expo-notifications` is NOT currently installed.

---

### Step 1 — Install the package

```bash
cd artifacts/margin
npx expo install expo-notifications
```

Then in `app.json`, add to the `expo.plugins` array:
```json
["expo-notifications", {
  "icon": "./assets/images/notification-icon.png",
  "color": "#7d9b76"
}]
```

> **TODO for you:** Create `assets/images/notification-icon.png` — a 96×96px image with a
> white icon on a transparent background (Android requirement). Use a simplified version of your
> app icon. The `color` above matches the current primary; update if your primary changes.

---

### Step 2 — Add import to profile.tsx

```tsx
import * as Notifications from "expo-notifications";
```

---

### Step 3 — Add requestNotificationPermission helper

Inside `ProfileScreen`, before the return statement, add:

```tsx
async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}
```

---

### Step 4 — Add scheduleDaily helper

```tsx
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
```

---

### Step 5 — Wire the dailyReminder toggle

Find:
```tsx
onChange={(v) => { setDailyReminder(v); savePref({ dailyReminder: v }); }}
```
Change to:
```tsx
onChange={async (v) => {
  if (v) {
    const granted = await requestNotificationPermission();
    if (!granted) {
      Alert.alert(
        "Permission required",
        "Enable notifications in your device settings to use reminders.",
      );
      return;
    }
    await scheduleDaily(
      "margin:daily_reminder",
      21, 0,                          // TODO for you: preferred default hour/minute (24h)
      "TODO: daily reminder title",   // TODO for you: e.g. "Time to write ✍️"
      "TODO: daily reminder body",    // TODO for you: e.g. "Your journal is waiting."
    );
  } else {
    await Notifications.cancelScheduledNotificationAsync("margin:daily_reminder").catch(() => {});
  }
  setDailyReminder(v);
  savePref({ dailyReminder: v });
}}
```

---

### Step 6 — Wire the onThisDay toggle

Find:
```tsx
onChange={(v) => { setOnThisDay(v); savePref({ onThisDay: v }); }}
```
Change to:
```tsx
onChange={async (v) => {
  if (v) {
    const granted = await requestNotificationPermission();
    if (!granted) return;
    await scheduleDaily(
      "margin:on_this_day",
      10, 0,
      "TODO: on this day title",  // TODO for you: e.g. "On this day"
      "TODO: on this day body",   // TODO for you: e.g. "You wrote something worth revisiting."
    );
  } else {
    await Notifications.cancelScheduledNotificationAsync("margin:on_this_day").catch(() => {});
  }
  setOnThisDay(v);
  savePref({ onThisDay: v });
}}
```

> **TODO for you:** This local notification fires daily with a generic message. A real "on this day"
> implementation needs a server-side scheduled job — a Supabase `pg_cron` rule or an Edge Function
> called on a schedule — that queries `pages` WHERE `created_at::date = (now() - interval '1 year')::date`
> for the user, then sends a personalized push via the Expo Push Notification API with the actual
> entry excerpt. The local notification above is a useful placeholder in the meantime.

---

### Step 7 — Wire the weeklyDigest toggle

Find:
```tsx
onChange={(v) => { setWeeklyDigest(v); savePref({ weeklyDigest: v }); }}
```
Change to:
```tsx
onChange={async (v) => {
  if (v) {
    const granted = await requestNotificationPermission();
    if (!granted) return;
    await Notifications.cancelScheduledNotificationAsync("margin:weekly_digest").catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: "margin:weekly_digest",
      content: {
        title: "TODO: digest title",  // TODO for you: e.g. "Your week in Margin"
        body: "TODO: digest body",    // TODO for you: e.g. "See what you wrote this week."
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 1,  // TODO for you: 1=Sunday, 2=Monday … 7=Saturday
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
```

---

## 4. App lock (Face ID / Touch ID)

**What it does:** When enabled, requires biometric auth each time the app comes to the foreground.

**The gap:** The toggle saves `appLock` to AsyncStorage but biometric authentication is never
triggered. `expo-local-authentication` is NOT installed.

---

### Step 1 — Install the package

```bash
cd artifacts/margin
npx expo install expo-local-authentication
```

---

### Step 2 — Wire the toggle in profile.tsx

Add import:
```tsx
import * as LocalAuthentication from "expo-local-authentication";
```

Find the appLock ToggleRow onChange:
```tsx
onChange={(v) => { setAppLock(v); savePref({ appLock: v }); }}
```
Change to:
```tsx
onChange={async (v) => {
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
}}
```

Reason: Require a successful auth before enabling the lock — prevents accidentally locking yourself
out on a device where biometrics stop working.

---

### Step 3 — Add foreground lock gate in _layout.tsx

Add imports to `app/_layout.tsx`:
```tsx
import * as LocalAuthentication from "expo-local-authentication";
import { AppState, AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
```

Inside the root layout component, add state and effect:
```tsx
const colors = useColors();
const [locked, setLocked] = useState(false);

useEffect(() => {
  async function checkLock(nextState: AppStateStatus) {
    if (nextState !== "active") return;
    const raw = await AsyncStorage.getItem("margin:settings");
    if (!raw) return;
    const prefs = JSON.parse(raw);
    if (!prefs.appLock) return;
    setLocked(true);
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock Margin",
      disableDeviceFallback: false,
    });
    if (result.success) setLocked(false);
  }

  const sub = AppState.addEventListener("change", checkLock);
  checkLock("active"); // run on initial mount too
  return () => sub.remove();
}, []);
```

In the return, add a guard before the navigation tree:
```tsx
if (locked) {
  return <View style={{ flex: 1, backgroundColor: colors.background }} />;
}
```

Import `useState`, `useEffect`, and `View` if not already imported there.

> **TODO for you:** The locked state renders a blank view. The biometric prompt fires on mount so
> the blank flash is brief — but you may want to show an app logo or a "Tap to unlock" label.

---

## 5. Change password

**What it does:** Taps "Change password" → modal to set a new password via `supabase.auth.updateUser`.

**The gap:** The row has no `onPress`.

**File to modify:** `artifacts/margin/app/(tabs)/profile.tsx`

---

### Step 1 — Add Modal, TextInput, ActivityIndicator to RN imports

```tsx
import {
  ActivityIndicator,
  Alert,
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
```

---

### Step 2 — Add modal state

Inside `ProfileScreen`, after existing state declarations:
```tsx
const [showPasswordModal, setShowPasswordModal] = useState(false);
const [newPassword, setNewPassword] = useState("");
const [passwordLoading, setPasswordLoading] = useState(false);
```

---

### Step 3 — Add change password handler

```tsx
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
```

---

### Step 4 — Wire the row

Find:
```tsx
<Row icon="lock" label="Change password" />
```
Change to:
```tsx
<Row icon="lock" label="Change password" onPress={() => setShowPasswordModal(true)} />
```

---

### Step 5 — Add modal JSX

After the closing `</ScrollView>` tag, add:

```tsx
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
```

---

### Step 6 — Add StyleSheet entries

Add to `StyleSheet.create({...})`:
```tsx
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
```

---

## 6. AI transcription quality

**What it does:** Passes a quality level from the user's settings to the Edge Function so Gemini
adjusts its approach for speed vs. accuracy.

**The gap:** The profile row shows hardcoded "Balanced". The Edge Function ignores any quality param.

**Files to modify:**
- `artifacts/margin/app/(tabs)/profile.tsx`
- `artifacts/margin/app/capture.tsx`
- `supabase/functions/transcribe/index.ts`

---

### Step 1 — Add transcriptionQuality to Prefs type in profile.tsx

Find:
```tsx
type Prefs = {
  dailyReminder: boolean;
```
Change to:
```tsx
type TranscriptionQuality = "standard" | "balanced" | "best";

type Prefs = {
  dailyReminder: boolean;
```

Add the field to the end of `Prefs` (before closing `}`):
```tsx
  transcriptionQuality: TranscriptionQuality;
```

Add to `DEFAULT_PREFS`:
```tsx
  transcriptionQuality: "balanced",
```

Add to the useState block:
```tsx
const [transcriptionQuality, setTranscriptionQuality] = useState<TranscriptionQuality>(DEFAULT_PREFS.transcriptionQuality);
```

Add to the AsyncStorage load useEffect, inside the `if (raw)` block:
```tsx
if (stored.transcriptionQuality !== undefined) setTranscriptionQuality(stored.transcriptionQuality);
```

Add `transcriptionQuality` to the `current` object in `savePref`:
```tsx
const current: Prefs = {
  dailyReminder, onThisDay, weeklyDigest,
  iCloudBackup, driveBackup, appLock, theme, coverColor,
  transcriptionQuality,
};
```

---

### Step 2 — Replace the hardcoded quality Row

Find:
```tsx
<Row
  icon="cpu"
  label="AI transcription quality"
  value="Balanced"
  last
/>
```
Change to:
```tsx
<Row
  icon="cpu"
  label="AI transcription quality"
  value={transcriptionQuality.charAt(0).toUpperCase() + transcriptionQuality.slice(1)}
  last
  onPress={() => {
    const options: { key: TranscriptionQuality; label: string }[] = [
      { key: "standard", label: "Standard — faster, skips uncertain words" },
      { key: "balanced", label: "Balanced — default" },
      { key: "best",     label: "Best — slower, highest accuracy" },
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
```

---

### Step 3 — Pass quality in capture.tsx when invoking transcribe

Find the `supabase.functions.invoke("transcribe", ...)` call. Change:
```tsx
supabase.functions
  .invoke("transcribe", { body: { page_id: pageId, image_path: imagePath } })
  .catch((err) => console.warn("[transcribe] invoke failed:", err));
```
To:
```tsx
AsyncStorage.getItem("margin:settings").then((raw) => {
  const quality = raw ? (JSON.parse(raw).transcriptionQuality ?? "balanced") : "balanced";
  supabase.functions
    .invoke("transcribe", { body: { page_id: pageId, image_path: imagePath, quality } })
    .catch((err) => console.warn("[transcribe] invoke failed:", err));
});
```

Add to capture.tsx imports if not already present:
```tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
```

---

### Step 4 — Read quality in the Edge Function (transcribe/index.ts)

In the body-parse block (Step 2), after `page_id = body.page_id`, add:
```ts
const quality: "standard" | "balanced" | "best" = body.quality ?? "balanced";
```

Then find the `systemInstructions` array (Step 7) and add quality guidance:
```ts
const qualityInstruction =
  quality === "standard"
    ? "TODO: standard instruction"   // TODO for you: e.g. "Prioritize speed. Only transcribe clearly legible words."
    : quality === "best"
    ? "TODO: best instruction"       // TODO for you: e.g. "Prioritize accuracy above all. Re-read every word using surrounding context."
    : "";

const systemInstructions = [
  "You are an expert at transcribing handwritten text from journal pages.",
  "Transcribe all visible handwritten text exactly as written, preserving line breaks.",
  "Return ONLY the transcribed text — no commentary, no formatting, no markdown.",
  qualityInstruction,
  glossaryHint,
]
  .filter(Boolean)
  .join("\n\n");
```

> **TODO for you:** Write the actual instruction strings for "standard" and "best". Also decide
> whether "best" should switch to a more powerful model — if so, replace `GEMINI_MODEL` at the top
> of the file with a conditional:
> ```ts
> const GEMINI_MODEL = quality === "best" ? "gemini-2.5-pro" : "gemini-2.5-flash";
> ```

---

## 7. Export full archive

**What it does:** Taps "Export full archive" → downloads all journal images and transcription text,
then opens the share sheet.

**The gap:** The row has no `onPress`. `expo-sharing` is not installed.

---

### Step 1 — Install expo-sharing

```bash
cd artifacts/margin
npx expo install expo-sharing
```

---

### Step 2 — Add imports to profile.tsx

```tsx
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
```

---

### Step 3 — Add export handler

```tsx
async function handleExport() {
  Alert.alert(
    "Export archive",
    "Downloads all journal pages and transcriptions. This may take a moment.",
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
              .select("id, page_number, image_path, transcription_text, journals!inner(title, user_id)")
              .eq("journals.user_id", session.user.id)
              .order("page_number");

            if (!pages?.length) {
              Alert.alert("Nothing to export", "You have no journal pages yet.");
              return;
            }

            const dir = FileSystem.cacheDirectory + "margin_export/";
            await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

            for (const page of pages) {
              const { data: blob } = await supabase.storage
                .from("journal_pages")
                .download(page.image_path);
              if (blob) {
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                await new Promise<void>((resolve) => {
                  reader.onloadend = async () => {
                    const b64 = (reader.result as string).split(",")[1];
                    await FileSystem.writeAsStringAsync(
                      dir + `page_${page.page_number}.jpg`,
                      b64,
                      { encoding: FileSystem.EncodingType.Base64 },
                    );
                    resolve();
                  };
                });
              }
              if (page.transcription_text) {
                await FileSystem.writeAsStringAsync(
                  dir + `page_${page.page_number}.txt`,
                  page.transcription_text,
                );
              }
            }

            // TODO for you: expo-file-system has no built-in ZIP. Options:
            //   (a) install react-native-zip-archive and zip `dir` before sharing
            //   (b) share the folder directly — on iOS this opens Files app without zipping
            //   (c) build a server-side export Edge Function that streams a ZIP from Storage
            // Current approach: share the folder directly (option b):
            await Sharing.shareAsync(dir);
          } catch (e) {
            Alert.alert("Export failed", String(e));
          }
        },
      },
    ],
  );
}
```

---

### Step 4 — Wire the row

Find:
```tsx
<Row icon="download" label="Export full archive" value="ZIP / PDF" />
```
Change to:
```tsx
<Row icon="download" label="Export full archive" value="ZIP / PDF" onPress={handleExport} />
```

---

## 8. Clear cached images (real size)

**What it does:** Shows the real cache directory size and clears it on confirmation.

**The gap:** Shows hardcoded "340 MB", no `onPress`.

**File to modify:** `artifacts/margin/app/(tabs)/profile.tsx`

---

### Step 1 — Add FileSystem import

```tsx
import * as FileSystem from "expo-file-system";
```
(Skip if already added for section 7.)

---

### Step 2 — Add cacheSize state and measurement

Inside `ProfileScreen`:
```tsx
const [cacheSize, setCacheSize] = useState<string>("...");

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
```

---

### Step 3 — Add clear handler

```tsx
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
            await FileSystem.deleteAsync(FileSystem.cacheDirectory, { idempotent: true });
          }
          setCacheSize("0 MB");
        },
      },
    ],
  );
}
```

---

### Step 4 — Wire the row

Find:
```tsx
<Row
  icon="trash-2"
  label="Clear cached images"
  value="340 MB"
  last
  destructive
/>
```
Change to:
```tsx
<Row
  icon="trash-2"
  label="Clear cached images"
  value={cacheSize}
  last
  destructive
  onPress={handleClearCache}
/>
```

---

## 9. Storage used (real data)

**What it does:** Replaces the hardcoded "2.4 GB / 15 GB" with actual storage data.

**The gap:** `StorageRow` uses `const used = 2.4` and `const total = 15`, both hardcoded.

**File to modify:** `artifacts/margin/app/(tabs)/profile.tsx`

> **TODO for you:** Supabase Storage SDK doesn't expose per-file byte sizes from the client easily.
> Two real options before implementing:
>
> (a) Add a `total_storage_bytes bigint DEFAULT 0` column to your `profiles` table. Maintain it
>     with a DB trigger on `storage.objects` that reads `(metadata->>'size')::bigint` and adds/subtracts
>     on INSERT/DELETE.
>
> (b) Call the Supabase management API or a service-role Edge Function to run:
>     `SELECT sum((metadata->>'size')::bigint) FROM storage.objects WHERE bucket_id = 'journal_pages'`
>
> Until you pick an approach, add a comment so it's easy to find:

Find in `StorageRow`:
```tsx
const used = 2.4;
const total = 15;
```
Change to:
```tsx
const used = 2.4;   // STUB — replace with real query once §9 approach is decided
const total = 15;   // STUB — replace with real plan limit if you add paid tiers
```

---

## 10. App links — Rate, Feedback, Help & FAQ

**What it does:** Opens the App Store review page, a feedback channel, and a help center URL.

**The gap:** All three rows have no `onPress`.

**File to modify:** `artifacts/margin/app/(tabs)/profile.tsx`

---

### Step 1 — Add Linking to React Native imports

Add `Linking` to the existing import block:
```tsx
import {
  Alert,
  Linking,
  // ... rest unchanged
} from "react-native";
```

---

### Step 2 — Wire each row

Find:
```tsx
<Row icon="star" label="Rate Margin" />
<Row icon="message-circle" label="Send feedback" />
<Row icon="help-circle" label="Help & FAQ" />
```
Change to:
```tsx
<Row
  icon="star"
  label="Rate Margin"
  onPress={() => {
    Linking.openURL("https://apps.apple.com/app/idTODO"); // TODO for you: App Store link
  }}
/>
<Row
  icon="message-circle"
  label="Send feedback"
  onPress={() => {
    Linking.openURL("mailto:TODO@TODO.com?subject=Margin%20Feedback"); // TODO for you: feedback email or form URL
  }}
/>
<Row
  icon="help-circle"
  label="Help & FAQ"
  onPress={() => {
    Linking.openURL("https://TODO"); // TODO for you: help center URL
  }}
/>
```

> **TODO for you:** Three URLs to fill in once you have them:
> - App Store link — available after you submit; format `https://apps.apple.com/app/idXXXXXXXXX`
> - Feedback destination — support email, Typeform, Notion form, Linear intake, etc.
> - Help center — a Notion doc, hosted FAQ page, etc.
