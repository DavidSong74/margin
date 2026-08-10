# Margin — Remaining Work

## Status at a glance

| # | Item | Status |
|---|------|--------|
| F1 | Configurable reminder time | 📋 To do |
| F2 | Journal statistics | 📋 To do |
| F3 | Adjustable reading font size | 📋 To do |
| F4 | Image export | 📋 To do |
| F5 | New journal reads cover-color pref | 📋 To do |
| O1 | Delete old cropped image from Storage | 📋 To do |
| O2 | Signed URL refresh on AppState foreground | 📋 To do |
| O3 | Stabilize `useColors` return to fix PageItem memo | 📋 To do |
| O4 | Skip `fetchPages` re-fetch when data is fresh | 📋 To do |
| O5 | Transcription stuck detection + recovery | 📋 To do |
| D1 | iCloud backup | ⏸ Defer |
| D2 | Google Drive backup | ⏸ Defer |
| D3 | Home screen widget | ⏸ Defer |

---

## Context that applies everywhere

- **Key AsyncStorage key:** `"margin:settings"` — all user preferences live here as a JSON object.
- **`Prefs` type and `savePref()` helper** are both in `artifacts/margin/app/(tabs)/profile.tsx` starting at line ~417. Any new preference must be added to this type AND to the `savePref` function's `current` object AND loaded in the `useEffect` that reads from AsyncStorage.
- **Supabase client** is `import { supabase } from "@/lib/supabase"`.
- **Color tokens** come from `import { useColors } from "@/hooks/useColors"`.
- **TypeScript** — no `any`, no non-null assertions unless the value is genuinely guaranteed.

---

## F1. Configurable reminder time

**Problem:** The "Daily writing reminder" toggle in Profile schedules a notification at hardcoded 9:00 PM. The "Reminder time" Row below the toggle (profile.tsx ~line 784) shows `value="9:00 PM"`, `chevron={false}`, and has no `onPress`. The hour/minute are also hardcoded in the `scheduleDaily(...)` call at ~line 771 as `21, 0`.

**Goal:** Tapping "Reminder time" opens an Alert with preset time options. The chosen time is saved to prefs and used when scheduling.

### Step 1 — Extend the `Prefs` type (~line 421)

```ts
type Prefs = {
  dailyReminder: boolean;
  onThisDay: boolean;
  weeklyDigest: boolean;
  iCloudBackup: boolean;
  driveBackup: boolean;
  appLock: boolean;
  coverColor: string;
  transcriptionQuality: TranscriptionQuality;
  reminderHour: number;   // ADD
  reminderMinute: number; // ADD
};
```

### Step 2 — Extend `DEFAULT_PREFS` (~line 432)

```ts
const DEFAULT_PREFS: Prefs = {
  ...
  reminderHour: 21,
  reminderMinute: 0,
};
```

### Step 3 — Add state variables (after existing pref states, ~line 468)

```ts
const [reminderHour, setReminderHour] = useState(DEFAULT_PREFS.reminderHour);
const [reminderMinute, setReminderMinute] = useState(DEFAULT_PREFS.reminderMinute);
```

### Step 4 — Load from AsyncStorage (inside the existing prefs `useEffect`, ~line 493)

```ts
if (stored.reminderHour !== undefined) setReminderHour(stored.reminderHour);
if (stored.reminderMinute !== undefined) setReminderMinute(stored.reminderMinute);
```

### Step 5 — Include in `savePref`'s `current` object (~line 524)

```ts
function savePref(patch: Partial<Prefs>) {
  const current: Prefs = {
    dailyReminder, onThisDay, weeklyDigest,
    iCloudBackup, driveBackup, appLock, coverColor, transcriptionQuality,
    reminderHour, reminderMinute, // ADD
  };
  AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, ...patch }));
}
```

### Step 6 — Replace the hardcoded `scheduleDaily` call (~line 771)

Change:
```ts
await scheduleDaily(
  "margin:daily_reminder", 21, 0,
  "Time to write ✍️", "Your journal is waiting.",
);
```
To:
```ts
await scheduleDaily(
  "margin:daily_reminder", reminderHour, reminderMinute,
  "Time to write ✍️", "Your journal is waiting.",
);
```

### Step 7 — Make "Reminder time" Row tappable (~line 784)

Replace:
```tsx
<Row
  icon="clock"
  label="Reminder time"
  value="9:00 PM"
  chevron={false}
  last={false}
/>
```
With:
```tsx
<Row
  icon="clock"
  label="Reminder time"
  value={formatTime(reminderHour, reminderMinute)}
  last={false}
  onPress={() => {
    const OPTIONS: { label: string; hour: number; minute: number }[] = [
      { label: "7:00 AM", hour: 7,  minute: 0 },
      { label: "8:00 AM", hour: 8,  minute: 0 },
      { label: "9:00 AM", hour: 9,  minute: 0 },
      { label: "12:00 PM", hour: 12, minute: 0 },
      { label: "6:00 PM", hour: 18, minute: 0 },
      { label: "8:00 PM", hour: 20, minute: 0 },
      { label: "9:00 PM", hour: 21, minute: 0 },
      { label: "10:00 PM", hour: 22, minute: 0 },
    ];
    Alert.alert(
      "Reminder time",
      "Choose when you'd like your daily writing reminder.",
      [
        ...OPTIONS.map((o) => ({
          text: o.label + (o.hour === reminderHour && o.minute === reminderMinute ? " ✓" : ""),
          onPress: async () => {
            setReminderHour(o.hour);
            setReminderMinute(o.minute);
            savePref({ reminderHour: o.hour, reminderMinute: o.minute });
            if (dailyReminder) {
              await scheduleDaily(
                "margin:daily_reminder", o.hour, o.minute,
                "Time to write ✍️", "Your journal is waiting.",
              );
            }
          },
        })),
        { text: "Cancel", style: "cancel" },
      ]
    );
  }}
/>
```

### Step 8 — Add `formatTime` helper (add near the top of the component file, before the component function)

```ts
function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const m = minute.toString().padStart(2, "0");
  return `${h}:${m} ${period}`;
}
```

---

## F2. Journal statistics

**Problem:** There is no way for users to see how much they've written — total pages, total words, writing streak.

**Goal:** Add a "Your stats" section to the Profile screen that shows real numbers from the database.

### Step 1 — Create a Supabase SQL function

Run this in the **Supabase SQL Editor**:

```sql
CREATE OR REPLACE FUNCTION public.get_user_stats()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'total_pages',
    (
      SELECT COUNT(p.id)
      FROM pages p
      JOIN journals j ON j.id = p.journal_id
      WHERE j.user_id = auth.uid()
        AND p.deleted_at IS NULL
    ),
    'total_words',
    (
      SELECT COALESCE(SUM(
        array_length(string_to_array(trim(p.transcription_text), ' '), 1)
      ), 0)
      FROM pages p
      JOIN journals j ON j.id = p.journal_id
      WHERE j.user_id = auth.uid()
        AND p.deleted_at IS NULL
        AND p.transcription_text IS NOT NULL
        AND trim(p.transcription_text) <> ''
    ),
    'total_journals',
    (
      SELECT COUNT(id)
      FROM journals
      WHERE user_id = auth.uid()
        AND deleted_at IS NULL
    ),
    'streak_days',
    (
      WITH daily AS (
        SELECT DISTINCT DATE(p.created_at) AS day
        FROM pages p
        JOIN journals j ON j.id = p.journal_id
        WHERE j.user_id = auth.uid()
          AND p.deleted_at IS NULL
        ORDER BY day DESC
      ),
      numbered AS (
        SELECT day, ROW_NUMBER() OVER (ORDER BY day DESC) AS rn
        FROM daily
      ),
      streak AS (
        SELECT day FROM numbered
        WHERE (CURRENT_DATE - day) = (rn - 1)
      )
      SELECT COUNT(*) FROM streak
    )
  );
$$;
```

Also add this RPC to `artifacts/margin/lib/database.types.ts` inside the `Functions` block:

```ts
get_user_stats: {
  Args: Record<never, never>;
  Returns: {
    total_pages: number;
    total_words: number;
    total_journals: number;
    streak_days: number;
  };
};
```

### Step 2 — Add a `StatsSection` component in `profile.tsx`

Add this component above the main `ProfileScreen` function:

```tsx
function StatsSection() {
  const colors = useColors();
  const [stats, setStats] = useState<{
    total_pages: number;
    total_words: number;
    total_journals: number;
    streak_days: number;
  } | null>(null);

  useEffect(() => {
    supabase.rpc("get_user_stats").then(({ data }) => {
      if (data) setStats(data as typeof stats);
    });
  }, []);

  const items = stats
    ? [
        { label: "Journals", value: stats.total_journals.toString() },
        { label: "Pages", value: stats.total_pages.toString() },
        { label: "Words", value: stats.total_words.toLocaleString() },
        { label: "Day streak", value: stats.streak_days.toString() },
      ]
    : null;

  return (
    <View
      style={[
        styles.statsCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      {items ? (
        items.map((item, i) => (
          <View
            key={item.label}
            style={[
              styles.statItem,
              i < items.length - 1 && {
                borderRightWidth: StyleSheet.hairlineWidth,
                borderRightColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.statValue,
                { color: colors.foreground, fontFamily: "PlayfairDisplay_700Bold" },
              ]}
            >
              {item.value}
            </Text>
            <Text
              style={[
                styles.statLabel,
                { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
              ]}
            >
              {item.label}
            </Text>
          </View>
        ))
      ) : (
        <ActivityIndicator size="small" color={colors.primary} />
      )}
    </View>
  );
}
```

Add these styles inside the existing `StyleSheet.create({...})` at the bottom of the file:

```ts
statsCard: {
  flexDirection: "row",
  borderRadius: 14,
  borderWidth: 1,
  marginBottom: 28,
  overflow: "hidden",
},
statItem: {
  flex: 1,
  alignItems: "center",
  paddingVertical: 16,
  gap: 4,
},
statValue: {
  fontSize: 22,
  letterSpacing: -0.5,
},
statLabel: {
  fontSize: 11,
  letterSpacing: 0.3,
  textTransform: "uppercase",
},
```

### Step 3 — Render it in the Profile JSX

Place `<StatsSection />` just after the profile header block (after the `</View>` that closes `styles.profileHeader`) and before the `<SectionHeader label="Account" />` line:

```tsx
{/* ── Stats ── */}
<StatsSection />

{/* ── Account ── */}
<SectionHeader label="Account" />
```

Also add `ActivityIndicator` to the React Native import if it isn't already there.

---

## F3. Adjustable reading font size

**Problem:** Transcription text in `journal/[id].tsx` uses a fixed `fontSize: 18, lineHeight: 32`. Users with different eyesight or preferences have no way to adjust this.

**Goal:** Add a font-size picker in Profile → Journaling. The chosen size persists and applies to the transcription reader.

### Step 1 — Extend `Prefs` and `DEFAULT_PREFS` in `profile.tsx`

```ts
type ReaderFontSize = "small" | "normal" | "large";

type Prefs = {
  ...
  readerFontSize: ReaderFontSize; // ADD
};

const DEFAULT_PREFS: Prefs = {
  ...
  readerFontSize: "normal",
};
```

### Step 2 — Add state, load, and save (same pattern as all other prefs)

In the component: `const [readerFontSize, setReaderFontSize] = useState<ReaderFontSize>(DEFAULT_PREFS.readerFontSize);`

In the load `useEffect`: `if (stored.readerFontSize !== undefined) setReaderFontSize(stored.readerFontSize);`

In `savePref`'s `current`: add `readerFontSize`.

### Step 3 — Add a Row for it in Profile → Journaling section (near the "AI transcription quality" row)

```tsx
<Row
  icon="type"
  label="Text size"
  value={readerFontSize.charAt(0).toUpperCase() + readerFontSize.slice(1)}
  last={false}
  onPress={() => {
    const OPTIONS: { key: ReaderFontSize; label: string }[] = [
      { key: "small",  label: "Small"  },
      { key: "normal", label: "Normal" },
      { key: "large",  label: "Large"  },
    ];
    Alert.alert(
      "Text size",
      "Sets the size of transcription text in the journal reader.",
      [
        ...OPTIONS.map((o) => ({
          text: o.label + (o.key === readerFontSize ? " ✓" : ""),
          onPress: () => { setReaderFontSize(o.key); savePref({ readerFontSize: o.key }); },
        })),
        { text: "Cancel", style: "cancel" },
      ]
    );
  }}
/>
```

### Step 4 — Create a `useReaderFontSize` hook

Create new file `artifacts/margin/hooks/useReaderFontSize.ts`:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const SIZES = { small: { fontSize: 15, lineHeight: 26 }, normal: { fontSize: 18, lineHeight: 32 }, large: { fontSize: 22, lineHeight: 38 } } as const;

export function useReaderFontSize() {
  const [key, setKey] = useState<keyof typeof SIZES>("normal");

  useEffect(() => {
    AsyncStorage.getItem("margin:settings").then((raw) => {
      if (!raw) return;
      const stored = JSON.parse(raw);
      if (stored.readerFontSize && stored.readerFontSize in SIZES) {
        setKey(stored.readerFontSize);
      }
    });
  }, []);

  return SIZES[key];
}
```

### Step 5 — Apply in `journal/[id].tsx`

Import the hook: `import { useReaderFontSize } from "@/hooks/useReaderFontSize";`

Add inside `JournalReaderScreen`: `const readerFont = useReaderFontSize();`

In `PageItem`, add `readerFont: { fontSize: number; lineHeight: number }` to the props interface, pass it from `renderPageItem`, and replace the hardcoded values in `styles.pageText` usage:

```tsx
// In PageItem's transcription TextInput:
style={[
  styles.pageText,
  { fontSize: readerFont.fontSize, lineHeight: readerFont.lineHeight, color: colors.foreground, fontFamily: "PlayfairDisplay_400Regular" },
]}

// In PageItem's edit TextInput:
style={[
  styles.pageText,
  styles.pageInput,
  { fontSize: readerFont.fontSize, color: colors.foreground, backgroundColor: colors.card, fontFamily: "PlayfairDisplay_400Regular" },
]}
```

Remove `fontSize` and `lineHeight` from `styles.pageText` in the StyleSheet since they're now applied inline.

---

## F4. Image export

**Problem:** `handleExport` in `profile.tsx` only exports a text file of transcriptions. Users cannot get their original handwritten page images out of the app.

**Goal:** When tapping "Export full archive", offer a choice: "Text only" (existing behavior) or "Images + text" (downloads every page image and shares a folder).

**Prerequisite:** No new package needed — uses `expo-file-system` (already installed) and `expo-sharing` (already installed).

**Note on limitations:** iOS Files app can view folders shared via `expo-sharing`. On Android, behavior depends on the file manager. A future enhancement could produce a ZIP (requires `react-native-zip-archive`).

### Step 1 — Replace `handleExport` in `profile.tsx`

```ts
async function handleExport() {
  Alert.alert(
    "Export archive",
    "What would you like to export?",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Text only",
        onPress: () => exportText(),
      },
      {
        text: "Images + text",
        onPress: () => exportImages(),
      },
    ]
  );
}

async function exportText() {
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
      await Sharing.shareAsync(filePath, { mimeType: "text/plain", UTI: "public.plain-text" });
    } else {
      Alert.alert("Sharing not available", "Your device doesn't support sharing files.");
    }
  } catch (e) {
    Alert.alert("Export failed", e instanceof Error ? e.message : String(e));
  }
}

async function exportImages() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: pages } = await supabase
      .from("pages")
      .select("page_number, image_path, transcription_text, journals!inner(title, user_id)")
      .eq("journals.user_id", session.user.id)
      .is("deleted_at", null)
      .order("page_number");

    if (!pages?.length) {
      Alert.alert("Nothing to export", "You have no journal pages yet.");
      return;
    }

    // Generate signed URLs for all pages in one batch
    const paths = pages.map((p) => p.image_path).filter(Boolean);
    const { data: signedList } = await supabase.storage
      .from("journal_pages")
      .createSignedUrls(paths, 300);

    const signedMap: Record<string, string> = Object.fromEntries(
      (signedList ?? []).map((s) => [s.path, s.signedUrl])
    );

    // Write images + a text file into a temp folder
    const exportDir = (FileSystem.cacheDirectory ?? "") + "margin_export/";
    await FileSystem.makeDirectoryAsync(exportDir, { intermediates: true });

    for (const page of pages) {
      const signedUrl = signedMap[page.image_path];
      if (!signedUrl) continue;
      const dest = `${exportDir}page_${String(page.page_number).padStart(3, "0")}.jpg`;
      await FileSystem.downloadAsync(signedUrl, dest);
    }

    // Write transcript alongside the images
    let content = "Margin — Journal Export\n";
    content += `Exported: ${new Date().toLocaleDateString()}\n\n`;
    for (const page of pages) {
      content += `--- Page ${page.page_number} ---\n`;
      content += (page.transcription_text ?? "(no transcription yet)") + "\n\n";
    }
    await FileSystem.writeAsStringAsync(exportDir + "transcriptions.txt", content);

    if (await Sharing.isAvailableAsync()) {
      // Share the folder itself on iOS; on Android share the text file as fallback
      const target = Platform.OS === "ios" ? exportDir : exportDir + "transcriptions.txt";
      await Sharing.shareAsync(target, { mimeType: "text/plain", UTI: "public.folder" });
    } else {
      Alert.alert("Sharing not available", "Your device doesn't support sharing files.");
    }
  } catch (e) {
    Alert.alert("Export failed", e instanceof Error ? e.message : String(e));
  }
}
```

Add `Platform` to the React Native import if not already present.

---

## F5. New journal reads cover-color pref

**Problem:** `artifacts/margin/app/journal/new.tsx` hardcodes `selectedColor` to `COVER_COLORS[0].hex` on mount (line ~48), ignoring the "Cover color" preference the user set in Profile → Appearance.

**Goal:** When creating a new journal, pre-select the user's saved cover color preference.

### Step 1 — In `new.tsx`, add a `useEffect` after the `selectedColor` useState declaration

The `selectedColor` state is initialized to `COVER_COLORS[0].hex`. Add this immediately after:

```ts
useEffect(() => {
  AsyncStorage.getItem("margin:settings").then((raw) => {
    if (!raw) return;
    const stored = JSON.parse(raw);
    if (stored.coverColor && typeof stored.coverColor === "string") {
      setSelectedColor(stored.coverColor);
    }
  });
}, []);
```

### Step 2 — Add AsyncStorage import to `new.tsx` if not already present

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
```

That is the entire change. The existing color picker in the new-journal form will still work — the `useEffect` sets a starting value, and the user can change it before saving.

---

## O1. Delete old cropped image from Storage

**Problem:** Every crop uploads `cropped_<timestamp>.jpg` to Supabase Storage but the previous image (the one it replaced) is never removed. Over time a user will accumulate many orphaned files.

**File:** `artifacts/margin/app/journal/[id].tsx`, inside `handleCropResult` (~line 823).

**The rule:**
- After a successful DB update, delete the file at `imagePath` (the image being replaced by the crop).
- **Never** delete when `imagePath === originalPath`, because `originalPath` is already being stored as `original_image_path` in the DB and the user may restore it later.

### Step — Add the delete call inside the try block, after `setPages(...)` and before the `transcribe` invoke

```ts
// Delete the replaced file, but never delete the user's original
if (imagePath !== originalPath) {
  supabase.storage
    .from("journal_pages")
    .remove([imagePath])
    .catch((e) => console.warn("[Reader] cleanup old crop:", e));
}
```

Place this right after the `setPages(...)` call and before `await supabase.functions.invoke("transcribe", ...)`.

Do NOT await the `remove` call — it's fire-and-forget cleanup and should not block re-transcription.

---

## O2. Signed URL refresh on AppState foreground

**Problem:** Signed URLs are generated with a 3600-second TTL. If the app is backgrounded for >1 hour and then re-opened, all journal images show broken/expired URLs. The `useFocusEffect` only re-runs `fetchPages` when the screen regains focus within the app (e.g. navigating back from another tab), not when the app returns from background.

**File:** `artifacts/margin/app/journal/[id].tsx`

### Step — Add an AppState listener that refreshes signed URLs when the app returns from background

Add this `useEffect` after the existing Realtime subscription `useEffect`:

```ts
useEffect(() => {
  const sub = AppState.addEventListener("change", async (nextState) => {
    if (nextState !== "active") return;
    if (!pages.length) return;

    // Re-generate signed URLs for all current page image paths
    const imagePaths = pages.map((p) => p.imagePath).filter(Boolean);
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
}, [pages]);
```

Add `AppState` to the React Native import at the top of `[id].tsx`.

---

## O3. Stabilize `useColors` return to fix PageItem memo

**Problem:** `useColors()` in `artifacts/margin/hooks/useColors.ts` returns `{ ...palette, radius: colors.radius }` — a new object literal on every call. This means `colors` is a different reference on every render, busting `React.memo` on `PageItem` even when nothing visual changed. Every parent re-render (e.g. `currentPage` changing, `editMode` toggling) causes all `PageItem` cells to re-render unnecessarily.

**File:** `artifacts/margin/hooks/useColors.ts`

### Step — Wrap the return value in `useMemo`

Current code:
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

Replace with:
```ts
import { useMemo } from "react";
import { useColorScheme } from "react-native";
import colors from "@/constants/colors";
import { useTheme } from "@/hooks/useTheme";

export function useColors() {
  const { theme } = useTheme();
  const systemScheme = useColorScheme();
  const resolved = theme === "system" ? systemScheme : theme;
  return useMemo(() => {
    const palette = resolved === "dark" && colors.dark ? colors.dark : colors.light;
    return { ...palette, radius: colors.radius };
  }, [resolved]);
}
```

The `colors` module object is a module-level constant, so it never changes — only `resolved` needs to be in the dependency array. After this change, `colors` passed to `PageItem` will only be a new reference when the user switches light/dark mode, and `React.memo` will actually prevent unnecessary re-renders.

---

## O4. Skip `fetchPages` re-fetch when data is fresh

**Problem:** `useFocusEffect` re-runs `fetchPages` every single time the journal screen gains focus — navigating back from the share modal, returning from another tab, etc. Each call re-fetches all page rows from the DB and regenerates all signed URLs, even when no data has changed. This causes unnecessary network traffic and a loading flash.

**File:** `artifacts/margin/app/journal/[id].tsx`

### Step 1 — Add a ref to track the last successful fetch time

Add this near the other `useRef` declarations:

```ts
const lastFetchedAt = useRef<number>(0);
const FETCH_STALE_MS = 30_000; // treat data as fresh for 30 seconds
```

### Step 2 — Add a freshness guard at the top of `fetchPages`

Inside the `fetchPages` callback, add this check after the `if (!journalId) return;` line:

```ts
const now = Date.now();
const isStale = now - lastFetchedAt.current > FETCH_STALE_MS;
if (!isStale && pages.length > 0) return; // data is fresh, skip
```

### Step 3 — Stamp `lastFetchedAt` on success

At the end of the `try` block in `fetchPages`, just before the `setPages(mapped)` call:

```ts
lastFetchedAt.current = Date.now();
```

**Important:** The Realtime subscription already handles live updates (transcription status changes, etc.), so skipping the re-fetch does NOT cause the UI to miss updates. The freshness guard only prevents redundant cold-fetch round-trips.

---

## O5. Transcription stuck detection + recovery

**Problem:** When a page has `transcriptionStatus === "pending"` or `"processing"`, the UI shows "Transcribing…" indefinitely. If the Supabase Realtime websocket drops (background, network interruption), the status update from the Edge Function never arrives and the page is stuck forever with no retry affordance.

**File:** `artifacts/margin/app/journal/[id].tsx`

### Step — Add a polling effect that re-checks stuck pages every 30 seconds

Add this `useEffect` after the Realtime subscription effect:

```ts
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
```

**Why the dependency array:** `pages.map(...).join(",")` produces a stable primitive string. It only changes when a transcription status actually changes, so the effect re-arms (and restarts the 30s timer) when pages finish or new ones start. It does NOT re-arm on unrelated state changes like `currentPage` or `editMode`.

This is a safety net for dropped Realtime events, not a replacement for the subscription. When the subscription is working normally, it fires instantly and this timer never triggers.

---

## Deferred features

### D1. iCloud backup
Requires `com.apple.developer.ubiquity-container-identifiers` entitlement and native CloudKit APIs — not available in Expo managed workflow. The toggle saves to prefs but does nothing. Revisit after App Store launch.

### D2. Google Drive backup
Full OAuth integration required. The toggle saves to prefs but does nothing. High complexity for v1 — implement post-launch.

### D3. Home screen widget
Requires a native Widget Extension target (iOS 16+) outside Expo managed workflow. Revisit when a native dev build pipeline is in place.
