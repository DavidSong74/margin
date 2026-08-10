# Margin — Remaining Work

## Status at a glance

| # | Item | Status |
|---|------|--------|
| N1 | Dark mode / theme system | ✅ Fixed |
| B1 | Crop coordinates mismatch | ✅ Fixed |
| C1 | Restore original image (permanent, no expiry) | ✅ Fixed |
| D1 | iCloud backup | ⏸ Defer |
| D2 | Google Drive backup | ⏸ Defer |
| D3 | Home screen widget | ⏸ Defer |

---

## N1. Dark mode / theme system

**Problem:** `ThemeRow` in `profile.tsx` lets the user pick Light / Dark / System, and the pref
is saved to AsyncStorage. But `constants/colors.ts` has no dark palette — `useColors()` returns
the same light tokens regardless of the setting.

**Files to modify:**
- `constants/colors.ts` — add `darkColors` object
- `hooks/useColors.ts` — resolve "system" → device scheme, return dark palette when dark

**Step 1 — Add a dark palette to `constants/colors.ts`:**

```ts
export const darkColors = {
  background:        "#1a1a18",
  foreground:        "#f0ede8",
  card:              "#232320",
  cardForeground:    "#f0ede8",
  border:            "#3a3a36",
  input:             "#2e2e2a",
  primary:           "#8aab83",
  primaryForeground: "#1a1a18",
  secondary:         "#2e2e2a",
  secondaryForeground: "#c8c5be",
  muted:             "#2a2a27",
  mutedForeground:   "#8a8880",
  accent:            "#2e2e2a",
  accentForeground:  "#f0ede8",
  destructive:       "#e05c5c",
  destructiveForeground: "#f0ede8",
};
```

> **TODO for you:** Adjust hex values to taste. The above uses warm near-blacks to match the
> existing light palette's warm undertone.

**Step 2 — Update `hooks/useColors.ts`:**

```ts
import { useColorScheme } from "react-native";
import { useTheme } from "./useTheme";
import { colors as lightColors, darkColors } from "@/constants/colors";

export function useColors() {
  const { theme } = useTheme();
  const deviceScheme = useColorScheme();
  const isDark =
    theme === "dark" || (theme === "system" && deviceScheme === "dark");
  return isDark ? darkColors : lightColors;
}
```

No changes needed in `app/_layout.tsx` — `ThemeProvider` already wraps the tree.

**Watch out for:** Hardcoded hex values in icon renders or tintColor props won't adapt
automatically. Audit after enabling dark mode.

---

## B1. Crop coordinates mismatch (bug — fix later)

**Problem:** The crop editor UI shows the correct crop selection visually, but the actual cropped
output doesn't match what the user set.

**Root cause:** `useWindowDimensions()` returns the **full window height including the iOS status
bar** (~47–59 px). But the CropEditor's root View is a flex child of the router layout, which
starts *below* the status bar — so the View's actual rendered height is `SH - statusBarHeight`.

Because `disp` (the letterboxed image rect) is computed from the inflated `SH`, the scale factors
are wrong. For a typical portrait image (pillarboxed left/right):

```
disp.h = SH              ← too tall; actual rendered height is less
disp.w = SH * ia         ← derived from SH, also too large
scaleX = imageWidth / disp.w   ← scale factor is too small
```

The crop handles move in real screen coordinates, but `disp` used to convert back to image-space
is offset. Result: the cropped region is shifted and incorrectly sized vs. what the user selected.

**File:** `artifacts/margin/components/CropEditor.tsx`

**Fix:** Replace `useWindowDimensions()` with an `onLayout` callback on the root View so the
letterbox math uses the dimensions the image is *actually rendered within*:

```tsx
const [viewLayout, setViewLayout] = useState<{ w: number; h: number } | null>(null);

// Root View:
<View
  style={styles.root}
  onLayout={(e) => {
    const { width, height } = e.nativeEvent.layout;
    setViewLayout({ w: width, h: height });
  }}
>

// Replace SW/SH in the disp useMemo:
const SW = viewLayout?.w ?? 0;
const SH = viewLayout?.h ?? 0;

// Guard: don't render the crop overlay until layout is measured
if (!viewLayout) {
  return (
    <View style={styles.root} onLayout={...}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
    </View>
  );
}
```

`initRect` is derived from `disp` so it will also be correct once `viewLayout` is set. No other
changes needed — the PanResponder math and `handleCrop` scale factors are correct.

---

## C1. Restore original image (permanent)

**What it does:** After cropping a page, a "Restore original" button appears permanently in the
Original tab. Tapping it swaps the cropped image back to the original and re-triggers transcription.
No time window — the original is kept indefinitely since storage cost is negligible.

**Required DB migration** — add one column to `pages` (no `cropped_at` needed):

```sql
ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS original_image_path text;
```

Run this in the Supabase SQL Editor.

**Update `handleCropResult` in `journal/[id].tsx`** to stash the old path before overwriting:

```tsx
await supabase
  .from("pages")
  .update({
    original_image_path: page.imagePath,  // stash pre-crop path
    image_path: newImagePath,
    transcription_text: null,
    transcription_status: "pending",
    pending_corrections: [],
    correction_count: 0,
  })
  .eq("id", pageId);
```

Also update local state to carry `originalImagePath` forward:

```tsx
setPages((prev) =>
  prev.map((p) =>
    p.id === pageId
      ? {
          ...p,
          originalImagePath: p.imagePath,  // stash before overwriting
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
```

**Update the `JournalPage` type:**

```ts
interface JournalPage {
  // ...existing fields...
  originalImagePath: string | null;
}
```

Map it in `fetchPages`:

```ts
originalImagePath: r.original_image_path ?? null,
```

**Add `handleResetCrop` in `journal/[id].tsx`:**

```tsx
const handleResetCrop = useCallback(async () => {
  const page = pages[currentPage];
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
            prev.map((p, i) =>
              i === currentPage ? { ...p, transcriptionStatus: "processing" } : p
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
            .eq("id", page.id);

          setPages((prev) =>
            prev.map((p, i) =>
              i === currentPage
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

          await supabase.functions.invoke("transcribe", { body: { page_id: page.id } });
        },
      },
    ]
  );
}, [pages, currentPage]);
```

**Show the Restore button in `PageItem`**, below the crop button. Pass `onResetPress` as a prop
(same pattern as `onCropPress`). Render whenever `page.originalImagePath` is set:

```tsx
{onResetPress && page.originalImagePath && (
  <TouchableOpacity
    style={[styles.resetOrigBtn, { borderColor: colors.destructive }]}
    onPress={() => onResetPress(page.id)}
    activeOpacity={0.75}
  >
    <Feather name="rotate-ccw" size={15} color={colors.destructive} />
    <Text style={[styles.resetOrigBtnText, { color: colors.destructive, fontFamily: "Inter_500Medium" }]}>
      Restore original
    </Text>
  </TouchableOpacity>
)}
```

Add to `database.types.ts` — the `pages` Row type:

```ts
original_image_path: string | null;
```

**Note:** Cropping again after a restore is fine — `handleCropResult` will stash the (now
restored) original path again. Cropping a second time without restoring first will overwrite the
stashed path, so the user loses the ability to go back to the first original. This is acceptable
for v1.

---

## Deferred features

### D1. iCloud backup

Requires `com.apple.developer.ubiquity-container-identifiers` entitlement and native CloudKit
APIs — not available in Expo managed workflow. Practical v1 workaround: save exports to
`FileSystem.documentDirectory` (iCloud Drive can sync this if the user enables it in iOS Settings).
Revisit after App Store launch if users request automatic background sync.

### D2. Google Drive backup

Full OAuth integration: Google Cloud project, Drive API, `expo-auth-session`, refresh token
management. High complexity relative to value for v1. Implement post-launch.

### D3. Home screen widget

Requires a native Widget Extension target (iOS 16+), outside Expo managed workflow without bare
ejection or a custom dev client. Revisit when a native dev build pipeline is in place.
