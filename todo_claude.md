# Margin — Remaining Work

## Status at a glance

| # | Item | Status |
|---|------|--------|
| F1 | Fix App Store URL placeholder | 📋 To do |
| F2 | Fix "Text / PDF" label on export row | 📋 To do |
| F3 | Wire "New journal defaults" row | 📋 To do |
| F4 | Dynamic version from expo-constants | 📋 To do |
| F5 | Pass transcriptionQuality to retry / crop / reset invocations | 📋 To do |
| F6 | Replace personal Gmail in feedback link | 📋 To do |
| F7 | Dynamic storage quota | 📋 To do |
| F8 | Fix hardcoded screen width in new journal color swatches | 📋 To do |
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

## F1. Fix App Store URL placeholder

**Problem:** The "Rate Margin" row in Profile opens `https://apps.apple.com/app/idTODO`, which is a broken URL — `idTODO` is a literal placeholder, not a real App Store numeric ID.

**Blocked until:** The app is submitted to App Store Connect and assigned an App ID. Once you have the numeric ID (e.g. `id6743210988`), apply the one-line fix below.

**File:** `artifacts/margin/app/(tabs)/profile.tsx`, line ~1185.

### Step — Replace the placeholder with the real App Store ID

Find:
```ts
Linking.openURL("https://apps.apple.com/app/idTODO").catch(() =>
```
Replace with:
```ts
Linking.openURL("https://apps.apple.com/app/idXXXXXXXXX").catch(() =>
```
Where `idXXXXXXXXX` is the numeric App Store ID assigned by Apple.

---

## F2. Fix "Text / PDF" label on export row

**Problem:** The export row in Profile shows `value="Text / PDF"` but no PDF generation exists anywhere — `exportText()` produces a `.txt` file and `exportImages()` produces JPEGs. The label is misleading.

**File:** `artifacts/margin/app/(tabs)/profile.tsx`, line ~1071.

### Step — Change the value label

Find:
```tsx
value="Text / PDF"
```
Replace with:
```tsx
value="Text / Images"
```

That is the entire change.

---

## F3. Wire "New journal defaults" row

**Problem:** `profile.tsx` line ~1116 renders:
```tsx
<Row icon="settings" label="New journal defaults" />
```
No `onPress` is passed. The row has a right-facing chevron (default), so it looks interactive, but tapping it does nothing (only fires `Haptics.selectionAsync()` from the `Row` component's internal press handler, if any). There is no "New journal defaults" screen.

**Goal:** Open a modal that lets the user set:
1. Default cover color for new journals (reads/writes the same `coverColor` pref already used by the Appearance section).
2. Default transcription quality for new journals (reads/writes the same `transcriptionQuality` pref).

These prefs are already in `Prefs` and `savePref`, so no new persistence is needed — this is purely a UI surface.

### Step 1 — Add modal state in the ProfileScreen component body (~line 468)

```ts
const [showDefaultsModal, setShowDefaultsModal] = useState(false);
```

### Step 2 — Wire the Row's onPress (~line 1116)

Change:
```tsx
<Row icon="settings" label="New journal defaults" />
```
To:
```tsx
<Row
  icon="settings"
  label="New journal defaults"
  onPress={() => setShowDefaultsModal(true)}
/>
```

### Step 3 — Add the Modal JSX

Place this directly after the closing tag of the main `<ScrollView>` and before the existing crop/password modals:

```tsx
{/* ── New journal defaults modal ── */}
<Modal
  visible={showDefaultsModal}
  animationType="slide"
  presentationStyle="pageSheet"
  onRequestClose={() => setShowDefaultsModal(false)}
>
  <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
    <View style={styles.modalHeader}>
      <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "PlayfairDisplay_700Bold" }]}>
        New journal defaults
      </Text>
      <Pressable onPress={() => setShowDefaultsModal(false)}>
        <Feather name="x" size={22} color={colors.mutedForeground} />
      </Pressable>
    </View>

    <SectionHeader label="Cover color" />
    <CoverColorRow
      coverColor={coverColor}
      onChange={(hex) => { setCoverColor(hex); savePref({ coverColor: hex }); }}
    />

    <SectionHeader label="Transcription" />
    <Row
      icon="cpu"
      label="AI transcription quality"
      value={transcriptionQuality.charAt(0).toUpperCase() + transcriptionQuality.slice(1)}
      last
      onPress={() => {
        const OPTIONS = [
          { key: "balanced" as const, label: "Balanced" },
          { key: "best"     as const, label: "Best"     },
        ];
        Alert.alert(
          "Transcription quality",
          "Applied to all new transcriptions for journals you create.",
          [
            ...OPTIONS.map((o) => ({
              text: o.label + (o.key === transcriptionQuality ? " ✓" : ""),
              onPress: () => { setTranscriptionQuality(o.key); savePref({ transcriptionQuality: o.key }); },
            })),
            { text: "Cancel", style: "cancel" as const },
          ]
        );
      }}
    />
  </View>
</Modal>
```

`CoverColorRow` and `SectionHeader` are already defined in `profile.tsx` — no new imports needed beyond `Modal` (add it to the React Native import if not present).

### Step 4 — Add styles

Inside the existing `StyleSheet.create({...})`:
```ts
modalRoot: {
  flex: 1,
  paddingTop: 8,
},
modalHeader: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: 20,
  paddingVertical: 16,
},
modalTitle: {
  fontSize: 20,
  letterSpacing: -0.3,
},
```

---

## F4. Dynamic version from expo-constants

**Problem:** `profile.tsx` line ~1200 hardcodes `value="1.0.0"`. Every release requires a manual update to this string or it silently drifts out of sync with `app.json`.

**File:** `artifacts/margin/app/(tabs)/profile.tsx`

### Step 1 — Add expo-constants import at the top of the file

```ts
import Constants from "expo-constants";
```

### Step 2 — Replace the hardcoded value (~line 1200)

Find:
```tsx
value="1.0.0"
```
Replace with:
```tsx
value={Constants.expoConfig?.version ?? "—"}
```

No other changes needed. The value now tracks whatever is in `app.json`'s `"version"` field automatically.

---

## F5. Pass transcriptionQuality to retry / crop / reset invocations

**Problem:** `capture.tsx` already reads `transcriptionQuality` from AsyncStorage and passes it to the Edge Function (line ~243). However, there are three other places in `artifacts/margin/app/journal/[id].tsx` that invoke the `transcribe` Edge Function without passing `quality`:

| Location | Line | Description |
|----------|------|-------------|
| `handleRetryTranscription` | ~854 | User taps "Retry" on a failed transcription |
| `handleCropResult` | ~952 | After a crop, triggers re-transcription |
| `handleResetCrop` | ~1017 | After restoring the original image |

The Edge Function already handles the `quality` param (`artifacts/margin/supabase/functions/transcribe/index.ts` lines 45–148) — it just needs to be passed.

### Step 1 — Add a helper that reads quality from AsyncStorage

Add this near the top of `JournalReaderScreen` (after the state declarations, ~line 370):

```ts
const getQuality = useCallback(async (): Promise<"balanced" | "best"> => {
  try {
    const raw = await AsyncStorage.getItem("margin:settings");
    if (!raw) return "balanced";
    const stored = JSON.parse(raw);
    return stored.transcriptionQuality === "best" ? "best" : "balanced";
  } catch {
    return "balanced";
  }
}, []);
```

`AsyncStorage` is already imported at the top of `[id].tsx`.

### Step 2 — Update `handleRetryTranscription` (~line 854)

Find:
```ts
const { error } = await supabase.functions.invoke("transcribe", {
  body: { page_id: page.id },
});
```
Replace with:
```ts
const quality = await getQuality();
const { error } = await supabase.functions.invoke("transcribe", {
  body: { page_id: page.id, quality },
});
```

### Step 3 — Update `handleCropResult` (~line 952)

Find:
```ts
await supabase.functions.invoke("transcribe", { body: { page_id: pageId } });
```
Replace with:
```ts
const quality = await getQuality();
await supabase.functions.invoke("transcribe", { body: { page_id: pageId, quality } });
```

### Step 4 — Update `handleResetCrop` (~line 1017)

Find the `supabase.functions.invoke("transcribe", ...)` call inside `handleResetCrop` and apply the same pattern:
```ts
const quality = await getQuality();
await supabase.functions.invoke("transcribe", { body: { page_id: pageId, quality } });
```

### Step 5 — Add `getQuality` to the `useCallback` dependency arrays

For `handleRetryTranscription`:
```ts
}, [pages, currentPage, getQuality]);
```
For `handleCropResult`:
```ts
}, [cropState, getQuality]);
```
For `handleResetCrop` — locate its existing dependency array and add `getQuality`.

---

## F6. Replace personal Gmail in feedback link

**Problem:** `profile.tsx` line ~1194 opens `mailto:songdavid93374@gmail.com` — a personal address that should not be the public-facing support contact.

**File:** `artifacts/margin/app/(tabs)/profile.tsx`, line ~1194.

### Step — Replace with your product/support email address

Find:
```ts
Linking.openURL("mailto:songdavid93374@gmail.com?subject=Margin%20Feedback")
```
Replace with the address you want to receive feedback at, e.g.:
```ts
Linking.openURL("mailto:hello@margin.app?subject=Margin%20Feedback")
```

---

## F7. Dynamic storage quota

**Problem:** `profile.tsx` line ~343 hardcodes `const TOTAL_GB = 15`. The storage bar and "X GB available" label will always show 15 GB regardless of the user's actual plan, making the UI misleading if you ever introduce tiers.

**Recommended approach:** Add a `storage_limit_bytes` column to the user's profile row in Supabase, defaulting to 15 GB. Read it alongside the existing `get_user_storage_bytes` RPC call. This keeps the logic server-side and is plan-aware without any client changes beyond the initial fetch.

### Step 1 — Run this migration in the Supabase SQL Editor

```sql
-- Add a per-user storage limit (default 15 GB)
ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS raw_app_meta_data jsonb;

-- Or if you have a separate profiles table, add it there:
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_limit_bytes bigint NOT NULL DEFAULT 16106127360  -- 15 GB
);

-- Ensure every existing user has a profiles row
INSERT INTO public.profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;
```

> If a `profiles` table already exists in your schema, just add the column: `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS storage_limit_bytes bigint NOT NULL DEFAULT 16106127360;`

### Step 2 — Add an RPC that returns both used bytes and the limit

```sql
CREATE OR REPLACE FUNCTION public.get_storage_info()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'used_bytes',  (SELECT get_user_storage_bytes()),
    'limit_bytes', (SELECT storage_limit_bytes FROM profiles WHERE id = auth.uid())
  );
$$;
```

Add to `artifacts/margin/lib/database.types.ts` inside `Functions`:
```ts
get_storage_info: {
  Args: Record<never, never>;
  Returns: { used_bytes: number; limit_bytes: number };
};
```

### Step 3 — Update `StorageRow` in `profile.tsx` (~line 330)

Replace the two separate `useEffect` calls (one for `get_user_storage_bytes`) with a single call to `get_storage_info`. Replace the hardcoded `TOTAL_GB`:

```ts
const BYTES_PER_GB = 1024 ** 3;

function StorageRow() {
  const colors = useColors();
  const [usedBytes, setUsedBytes]   = useState<number | null>(null);
  const [limitBytes, setLimitBytes] = useState<number>(15 * BYTES_PER_GB);

  useEffect(() => {
    supabase.rpc("get_storage_info").then(({ data }) => {
      if (!data) return;
      setUsedBytes(data.used_bytes);
      setLimitBytes(data.limit_bytes);
    });
  }, []);

  const usedGB  = usedBytes !== null ? usedBytes  / BYTES_PER_GB : null;
  const limitGB = limitBytes / BYTES_PER_GB;
  const pct     = usedGB !== null ? Math.min(usedGB / limitGB, 1) : 0;
  const available = usedGB !== null ? (limitGB - usedGB).toFixed(1) : "…";
  const displayUsed = usedGB !== null ? usedGB.toFixed(2) : "…";

  // rest of JSX unchanged — replace every reference to TOTAL_GB with limitGB
}
```

---

## F8. Fix hardcoded screen width in new journal color swatches

**Problem:** `artifacts/margin/app/journal/new.tsx` line ~67 computes swatch sizes using `const SCREEN_W = 375`, a hardcoded approximation. On larger iPhones or iPads the swatches are the wrong size.

**File:** `artifacts/margin/app/journal/new.tsx`

### Step 1 — Import `useWindowDimensions`

Add to the React Native import at the top:
```ts
import { ..., useWindowDimensions } from "react-native";
```

### Step 2 — Replace the hardcoded constant inside the component

The component is a function component. Add this at the top of the function body, above any computed values that depend on `SCREEN_W`:

```ts
const { width: SCREEN_W } = useWindowDimensions();
```

Then delete the line:
```ts
const SCREEN_W = 375; // approximation; will stretch fine
```

`swatchSize` is computed from `SCREEN_W` on the next line and requires no other changes — it will now recalculate correctly whenever the window width changes (rotation, iPad multitasking).

---

## Deferred features

### D1. iCloud backup
Requires `com.apple.developer.ubiquity-container-identifiers` entitlement and native CloudKit APIs — not available in Expo managed workflow. The toggle saves to prefs but does nothing. Revisit after App Store launch.

### D2. Google Drive backup
Full OAuth integration required. The toggle saves to prefs but does nothing. High complexity for v1 — implement post-launch.

### D3. Home screen widget
Requires a native Widget Extension target (iOS 16+) outside Expo managed workflow. Revisit when a native dev build pipeline is in place.
