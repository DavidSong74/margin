# Margin — Remaining Features

## Status at a glance

| # | Feature | Status |
|---|---------|--------|
| O1 | Drop `p_user_id` from `save_correction` | 🔧 Optimization |
| O2 | Collapse `fetchJournals` round trips | 🔧 Optimization |
| O3 | Pass `is_private` as route param | 🔧 Optimization |
| O4 | Guard `registerPushToken` to SIGNED_IN only | 🔧 Optimization |
| N1 | Dark mode / theme system | 📋 To do |
| N2 | AI transcription quality selector | 📋 To do |
| N3 | Change password | 📋 To do |
| N4 | Export full archive | 📋 To do |
| N5 | Default cover color preference | 📋 To do |
| N6 | Rate / Feedback / Help links | 📋 To do |
| N7 | Offline capture queue | 📋 To do |
| N8 | Share a page | 📋 To do |
| N9 | Search within a single journal | 📋 To do |
| D1 | iCloud backup | ⏸ Defer |
| D2 | Google Drive backup | ⏸ Defer |
| D3 | Home screen widget | ⏸ Defer |


---

## D1. iCloud backup — Deferred

> **Deferred:** Implement after the app ships and user demand is confirmed.

**When to implement:** True iCloud sync requires the `com.apple.developer.ubiquity-container-identifiers`
entitlement and native CloudKit APIs, which Expo's managed workflow does not expose. A practical v1 approach
is to save exports to `FileSystem.documentDirectory` (which iCloud Drive can sync if the user enables
"iCloud Drive → Margin" in iOS Settings). See the `handleExport` implementation in `N4` for the export logic.

**Watch out for:** `react-native-cloud-store` exists for native CloudKit access but requires bare ejection.
Only pursue if users strongly request automatic background sync rather than manual export.

---


## Optimizations (code quality / security improvements to existing code)

These are changes to code that is already written. Each is self-contained and low-risk.

---

### O1. Drop `p_user_id` from `save_correction` RPC

**File:** `supabase/migrations/001_init_schema.sql` + `artifacts/margin/app/journal/[id].tsx`

**Problem:** `save_correction` is called with `p_user_id: user.id` from the client. The RPC is
`SECURITY INVOKER`, so RLS protects the tables, but accepting a user-supplied `p_user_id` is
unnecessary and leaves room for abuse if the security model ever changes. The function should
derive the user identity from `auth.uid()` internally.

**Fix:**

1. In `001_init_schema.sql`, remove the `p_user_id uuid` parameter and replace `p_user_id`
   with `auth.uid()` in the INSERT into `glossary`:

   ```sql
   create or replace function save_correction(
     p_page_id   uuid,
     p_original  text,
     p_corrected text
   ) returns void language plpgsql security invoker as $$
   begin
     insert into corrections (page_id, original_word, corrected_word)
       values (p_page_id, p_original, p_corrected)
       on conflict do nothing;

     insert into glossary (user_id, original_word, corrected_word, updated_at)
       values (auth.uid(), p_original, p_corrected, now())
       on conflict (user_id, original_word)
       do update set corrected_word = excluded.corrected_word, updated_at = now();
   end;
   $$;
   ```

   Run this in the Supabase SQL Editor to replace the existing function.

2. In `journal/[id].tsx`, find the `save_correction` RPC calls (in the batch correction handler)
   and remove the `p_user_id` argument:

   ```tsx
   // Before:
   supabase.rpc("save_correction", { p_page_id: ..., p_original: ..., p_corrected: ..., p_user_id: user.id })
   // After:
   supabase.rpc("save_correction", { p_page_id: ..., p_original: ..., p_corrected: ... })
   ```

3. Update `lib/database.types.ts` — remove `p_user_id` from the `save_correction` `Args` type:
   ```ts
   save_correction: {
     Args: { p_page_id: string; p_original: string; p_corrected: string };
     Returns: undefined;
   };
   ```

---

### O2. Collapse `fetchJournals` into a single round trip

**File:** `artifacts/margin/app/(tabs)/index.tsx`

**Problem:** `fetchJournals` in `index.tsx` makes two sequential Supabase calls: one to fetch
journals, then immediately a second call to `journal_pending_counts` RPC. On slow connections
this adds ~200–400 ms of unnecessary latency on every library load and tab focus.

**Fix:** Create a single RPC that returns journals with their pending counts in one call.

Run in Supabase SQL Editor:

```sql
CREATE OR REPLACE FUNCTION get_journals_with_counts()
RETURNS TABLE (
  id uuid,
  title text,
  cover_style text,
  cover_color text,
  cover_image_url text,
  is_private boolean,
  created_at timestamptz,
  pending_count bigint
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    j.id, j.title, j.cover_style, j.cover_color, j.cover_image_url,
    j.is_private, j.created_at,
    COUNT(p.id) FILTER (
      WHERE p.transcription_status IN ('pending', 'processing')
        AND p.deleted_at IS NULL
    ) AS pending_count
  FROM journals j
  LEFT JOIN pages p ON p.journal_id = j.id
  WHERE j.user_id = auth.uid()
  GROUP BY j.id
  ORDER BY j.created_at DESC;
$$;
```

In `index.tsx`, replace the two-call pattern in `fetchJournals` with a single RPC call:

```tsx
const { data, error } = await supabase.rpc("get_journals_with_counts");
if (error) throw error;
setJournals((data ?? []).map((r) => ({
  id: r.id,
  title: r.title,
  coverStyle: r.cover_style as "solid" | "image",
  coverColor: r.cover_color,
  coverImageUrl: r.cover_image_url,
  isPrivate: r.is_private ?? false,
  pendingCount: Number(r.pending_count ?? 0),
})));
```

Add the new function to `lib/database.types.ts`:

```ts
get_journals_with_counts: {
  Args: Record<string, never>;
  Returns: Array<{
    id: string;
    title: string;
    cover_style: string;
    cover_color: string | null;
    cover_image_url: string | null;
    is_private: boolean;
    created_at: string;
    pending_count: number;
  }>;
};
```

---

### O3. Pass `is_private` as a route param to avoid a redundant query

**Files:** `artifacts/margin/app/(tabs)/index.tsx`, `artifacts/margin/app/journal/[id].tsx`

**Problem:** When opening a journal, `journal/[id].tsx` fetches `is_private` from Supabase to
decide whether to show the biometric gate. But `index.tsx` already has this value on every
`JournalItem`. The extra query adds latency before the privacy gate can resolve, and it
means the screen shows a loading spinner unnecessarily.

**Fix:** Pass `isPrivate` as a URL param when navigating to the journal.

In `index.tsx`, change the navigation call:
```tsx
// Before:
router.push(`/journal/${journal.id}`);
// After:
router.push({ pathname: `/journal/[id]`, params: { id: journal.id, isPrivate: journal.isPrivate ? "1" : "0" } });
```

In `journal/[id].tsx`, read the param instead of fetching:
```tsx
const { id: journalId, isPrivate: isPrivateParam } = useLocalSearchParams<{ id: string; isPrivate?: string }>();

// In the privacy useEffect, use the param if available as the initial value,
// still fetch if the param is absent (e.g. deep link):
const initiallyPrivate = isPrivateParam === "1";
```

The biometric gate can now fire immediately on mount without waiting for a network call.
The full `is_private` fetch can be removed from `journal/[id].tsx` entirely; the toggle
that flips `is_private` in the DB already updates local state in the reader.

---

### O4. Guard `registerPushToken` to fire only on SIGNED_IN events

**File:** `artifacts/margin/app/_layout.tsx`

**Problem:** `registerPushToken` is called both on the initial session load AND inside
`onAuthStateChange`. The auth state change fires on every token refresh (which Supabase does
automatically every hour). This causes unnecessary SecureStore reads and potential Supabase
upserts on every refresh cycle.

**Fix:** Check the event type before calling:

```tsx
supabase.auth.onAuthStateChange((event, session) => {
  setSession(session);
  if (event === "SIGNED_IN" && session?.user) {
    registerPushToken(session.user.id);
  }
});
```

`SIGNED_IN` fires on initial login and on session restore from storage. `TOKEN_REFRESHED`
(the noisy one) does not fire `registerPushToken`. The initial `getSession()` call can keep
its unconditional `registerPushToken` since it only runs once on app launch.

---

## New Features

---

### N1. Dark mode / theme system

**Problem:** `ThemeRow` in `profile.tsx` lets the user pick Light / Dark / System, and
`useTheme()` is already wired in `profile.tsx`. But `constants/colors.ts` has no dark palette —
`useColors()` returns the same light tokens regardless of the setting.

**Files to modify:**
- `constants/colors.ts` — add `darkColors` object
- `hooks/useColors.ts` — resolve "system" → device scheme, return dark palette when dark

**Step 1 — Add a dark palette to `constants/colors.ts`:**

```ts
export const darkColors = {
  background:      "#1a1a18",   // near-black warm
  foreground:      "#f0ede8",   // off-white
  card:            "#232320",
  cardForeground:  "#f0ede8",
  border:          "#3a3a36",
  input:           "#2e2e2a",
  primary:         "#8aab83",   // sage green, slightly lighter for dark bg
  primaryForeground: "#1a1a18",
  secondary:       "#2e2e2a",
  secondaryForeground: "#c8c5be",
  muted:           "#2a2a27",
  mutedForeground: "#8a8880",
  accent:          "#2e2e2a",
  accentForeground: "#f0ede8",
  destructive:     "#e05c5c",
  destructiveForeground: "#f0ede8",
};
```

> **TODO for you:** Adjust these hex values to match your design. The values above are reasonable
> starting points — warm near-blacks to match the existing light palette's warm undertone.

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

**Watch out for:** Images and custom SVGs that are hardcoded to light colors won't adapt
automatically. Audit any `tintColor` or hardcoded hex values in icon renders.

---

### N2. AI transcription quality selector

**Problem:** `profile.tsx` shows a hardcoded "Balanced" quality label. The transcribe Edge
Function always uses the same prompt regardless of what quality the user wants.

**Files to modify:**
- `artifacts/margin/app/(tabs)/profile.tsx`
- `artifacts/margin/app/capture.tsx`
- `supabase/functions/transcribe/index.ts`

**Step 1 — Add `transcriptionQuality` to `Prefs` type and wire the row in `profile.tsx`:**

Currently the quality row renders a static value. Replace with an `Alert.alert` picker:

```tsx
onPress={() =>
  Alert.alert("Transcription Quality", "Choose quality", [
    { text: "Standard — faster, good for neat handwriting", onPress: () => { setTranscriptionQuality("standard"); savePref({ transcriptionQuality: "standard" }); } },
    { text: "Balanced — recommended", onPress: () => { setTranscriptionQuality("balanced"); savePref({ transcriptionQuality: "balanced" }); } },
    { text: "Best — slower, for difficult handwriting", onPress: () => { setTranscriptionQuality("best"); savePref({ transcriptionQuality: "best" }); } },
    { text: "Cancel", style: "cancel" },
  ])
}
```

**Step 2 — Read the quality in `capture.tsx` and pass it to the Edge Function:**

```tsx
const raw = await AsyncStorage.getItem("margin:settings");
const prefs = raw ? JSON.parse(raw) : {};
const quality = prefs.transcriptionQuality ?? "balanced";

await supabase.functions.invoke("transcribe", {
  body: { page_id: page.id, quality },
});
```

**Step 3 — Use quality in `supabase/functions/transcribe/index.ts`:**

```ts
const quality = body.quality ?? "balanced";

const qualityInstruction =
  quality === "standard"
    ? "Prioritize speed. Make reasonable guesses for unclear words."
    : quality === "best"
    ? "Prioritize accuracy. Take extra care with ambiguous characters, punctuation, and formatting. If a word is genuinely illegible, mark it with [illegible]."
    : "Balance speed and accuracy. Transcribe faithfully; use [illegible] only when truly unreadable.";

// Inject qualityInstruction into the system prompt alongside the existing instructions.
```

> **TODO for you:** Decide whether "best" should switch to `gemini-2.5-pro` instead of
> `gemini-2.5-flash`. Pro is slower and costs more but handles messy handwriting better.
> If you switch models by quality tier, keep the model name in a constant at the top of the
> Edge Function so it's easy to update.

---

### N3. Change password

**Problem:** The "Change password" row in `profile.tsx` has no `onPress`.

**File:** `artifacts/margin/app/(tabs)/profile.tsx`

**Step 1 — Add modal state:**

```tsx
const [showPasswordModal, setShowPasswordModal] = useState(false);
const [newPassword, setNewPassword] = useState("");
const [passwordLoading, setPasswordLoading] = useState(false);
```

**Step 2 — Add the handler:**

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
    setShowPasswordModal(false);
    setNewPassword("");
    Alert.alert("Done", "Your password has been updated.");
  }
}
```

**Step 3 — Wire the row and add the Modal:**

```tsx
// Wire onPress on the row:
onPress={() => setShowPasswordModal(true)}

// Add Modal above the return statement:
<Modal visible={showPasswordModal} transparent animationType="fade">
  <View style={styles.modalOverlay}>
    <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
      <Text style={[styles.modalTitle, { color: colors.foreground }]}>Change password</Text>
      <TextInput
        style={[styles.modalInput, { color: colors.foreground, borderColor: colors.border }]}
        placeholder="New password (min 8 chars)"
        placeholderTextColor={colors.mutedForeground}
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
        autoFocus
      />
      {passwordLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <View style={styles.modalButtons}>
          <TouchableOpacity onPress={() => { setShowPasswordModal(false); setNewPassword(""); }}>
            <Text style={{ color: colors.mutedForeground }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleChangePassword}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Update</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  </View>
</Modal>
```

Add to StyleSheet: `modalOverlay` (flex 1, backgroundColor `"rgba(0,0,0,0.5)"`, justifyContent
center, alignItems center), `modalCard` (width 300, borderRadius 16, padding 24, gap 16),
`modalTitle` (fontSize 18, fontFamily `"PlayfairDisplay_600SemiBold"`), `modalInput`
(borderWidth 1, borderRadius 8, padding 10, fontSize 15), `modalButtons` (flexDirection row,
justifyContent space-between).

---

### N4. Export full archive

**Problem:** The "Export full archive" row in `profile.tsx` has no `onPress`. Users have no
way to get their transcribed text out of the app.

**Prerequisite:** `npx expo install expo-sharing` (if not already installed).

**File:** `artifacts/margin/app/(tabs)/profile.tsx`

**Implementation:**

```tsx
async function handleExport() {
  Alert.alert(
    "Export archive",
    "This will create a text file with all your transcriptions.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Export",
        onPress: async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) return;

          // Fetch all non-deleted pages with journal info
          const { data: pages } = await supabase
            .from("pages")
            .select("page_number, transcription_text, created_at, journals!inner(title)")
            .is("deleted_at", null)
            .eq("journals.user_id", session.user.id)
            .order("created_at", { ascending: true });

          if (!pages?.length) {
            Alert.alert("Nothing to export", "No transcriptions found.");
            return;
          }

          // Group by journal
          const byJournal = new Map<string, typeof pages>();
          for (const p of pages) {
            const title = (p.journals as { title: string }).title;
            if (!byJournal.has(title)) byJournal.set(title, []);
            byJournal.get(title)!.push(p);
          }

          let content = `Margin export — ${new Date().toLocaleDateString()}\n\n`;
          for (const [title, journalPages] of byJournal) {
            content += `\n## ${title}\n\n`;
            for (const p of journalPages) {
              content += `### Page ${p.page_number}\n${p.transcription_text ?? "(no transcription)"}\n\n`;
            }
          }

          const path = `${FileSystem.cacheDirectory}margin_export_${Date.now()}.txt`;
          await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
          await Sharing.shareAsync(path, { mimeType: "text/plain" });
        },
      },
    ]
  );
}
```

Add `import * as FileSystem from "expo-file-system"` and `import * as Sharing from "expo-sharing"`
at the top of `profile.tsx`. Wire `onPress={handleExport}` on the export row.

---

### N5. Default cover color preference

**Problem:** When creating a new journal, `app/journal/new.tsx` always initializes `selectedColor`
to `COVER_COLORS[0].hex` (the first color), ignoring the saved `coverColor` preference in
`profile.tsx`.

**File:** `artifacts/margin/app/journal/new.tsx`

Add a `useEffect` after the `selectedColor` useState that reads the saved pref on mount:

```tsx
useEffect(() => {
  AsyncStorage.getItem("margin:settings").then((raw) => {
    if (!raw) return;
    const prefs = JSON.parse(raw);
    if (prefs.coverColor) setSelectedColor(prefs.coverColor);
  });
}, []);
```

Add `import AsyncStorage from "@react-native-async-storage/async-storage"` if not already
present. Only apply the saved color when the user hasn't yet switched to an image cover
(check `selectedStyle !== "image"` before setting).

---

### N6. Rate / Feedback / Help links

**Problem:** Three rows in `profile.tsx` have no `onPress`: "Rate Margin", "Send feedback",
and "Help & FAQ".

**File:** `artifacts/margin/app/(tabs)/profile.tsx`

Add `import { Linking } from "react-native"` (already in RN imports — just add `Linking`).
Wire each row:

```tsx
// Rate Margin
onPress={() => Linking.openURL("https://apps.apple.com/app/idYOUR_APP_ID")}

// Send feedback
onPress={() => Linking.openURL("mailto:feedback@yourdomain.com?subject=Margin%20Feedback")}

// Help & FAQ
onPress={() => Linking.openURL("https://yourdomain.com/help")}
```

> **TODO for you:** Three URLs to fill in:
> - App Store link (available after first submission; find it in App Store Connect)
> - Feedback email or form URL
> - Help center URL (can be a Notion page, GitHub wiki, or dedicated site)

---

### N7. Offline capture queue

**Problem:** If the user photographs a page while offline or on a flaky connection, the
upload to Supabase Storage fails silently. The capture screen shows an error state but
the page is lost — the user has to re-photograph it.

**Files to modify:**
- `artifacts/margin/app/capture.tsx`
- New file: `artifacts/margin/lib/captureQueue.ts`

**Implementation outline:**

1. Create `lib/captureQueue.ts` — persists a queue of pending uploads to AsyncStorage:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const QUEUE_KEY = "margin:captureQueue";

export interface QueuedCapture {
  localUri: string;       // local file:// URI
  journalId: string;
  pageNumber: number;
  capturedAt: string;
}

export async function enqueue(item: QueuedCapture): Promise<void> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue: QueuedCapture[] = raw ? JSON.parse(raw) : [];
  queue.push(item);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function dequeue(): Promise<QueuedCapture[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function remove(localUri: string): Promise<void> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue: QueuedCapture[] = raw ? JSON.parse(raw) : [];
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.filter((q) => q.localUri !== localUri)));
}
```

2. In `capture.tsx`, on upload failure, call `enqueue(...)` instead of showing a permanent
   error. Show a non-blocking toast: "Saved locally — will upload when connection returns."

3. In `app/_layout.tsx`, add a `NetInfo.addEventListener` (install `@react-native-community/netinfo`)
   that fires `processQueue()` when the device comes back online. `processQueue` dequeues items,
   attempts upload for each, and removes successfully uploaded items.

> **TODO for you:** Decide what to show in the library for queued-but-not-uploaded pages.
> Options: (a) don't create the Supabase page row until upload succeeds — the page is invisible
> in the library until connectivity returns; (b) create the row immediately with
> `transcription_status = 'pending'` and a local placeholder image, then replace the image
> on upload. Option (b) is more reassuring to the user.

---

### N8. Share a page

**Problem:** There is no way to share a transcription or its photo from the journal reader.
This is a common ask for journaling apps — sharing a quote with a friend or saving a photo
to Camera Roll.

**File:** `artifacts/margin/app/journal/[id].tsx`

Add a share icon button to the reader header (only visible when not in edit mode, and only
when a transcription exists):

```tsx
import { Share } from "react-native";
import * as MediaLibrary from "expo-media-library"; // for "Save to Photos"

async function handleShare() {
  const page = pages[currentPage];
  if (!page) return;

  const options = [];
  if (page.transcriptionText) options.push("Share transcription");
  options.push("Save photo to Camera Roll");
  options.push("Cancel");

  // Use ActionSheetIOS on iOS, Alert on Android
  Alert.alert("Share", undefined, [
    ...(page.transcriptionText ? [{
      text: "Share transcription",
      onPress: () => Share.share({ message: page.transcriptionText! }),
    }] : []),
    {
      text: "Save photo to Camera Roll",
      onPress: async () => {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== "granted") return;
        const url = supabase.storage.from("journal_pages").getPublicUrl(page.imagePath).data.publicUrl;
        // Download to cache then save
        const localPath = `${FileSystem.cacheDirectory}page_${page.id}.jpg`;
        await FileSystem.downloadAsync(url, localPath);
        await MediaLibrary.saveToLibraryAsync(localPath);
        Alert.alert("Saved", "Photo saved to your Camera Roll.");
      },
    },
    { text: "Cancel", style: "cancel" },
  ]);
}
```

Prerequisites: `npx expo install expo-media-library` and add `NSPhotoLibraryAddUsageDescription`
to `app.json` `infoPlist`.

---

### N9. Search within a single journal

**Problem:** The global search tab (`search.tsx`) finds pages across all journals. There is no
way to search within a specific journal — useful for long journals with dozens of pages.

**File:** `artifacts/margin/app/journal/[id].tsx`

Add a search icon to the journal reader header. When tapped, slide in a search bar above the
page list. Filter `pages` in memory by `transcriptionText.toLowerCase().includes(query)` and
highlight matching pages in the thumbnail strip or list view.

For the thumbnail strip specifically: visually dim non-matching pages (opacity 0.3) and
scroll to the first match automatically.

```tsx
const [searchQuery, setSearchQuery] = useState("");
const [searchActive, setSearchActive] = useState(false);

const matchingPageIndices = useMemo(() => {
  if (!searchQuery.trim()) return null;
  const q = searchQuery.toLowerCase();
  return pages.reduce<number[]>((acc, p, i) => {
    if (p.transcriptionText?.toLowerCase().includes(q)) acc.push(i);
    return acc;
  }, []);
}, [searchQuery, pages]);
```

This is a pure client-side filter — no new Supabase queries needed. The existing `pages` array
(already fetched on journal open) is the source of truth.

---

## Deferred features (implement in a future phase)

### iCloud backup (§4) and Google Drive backup (§5)

The full implementation details are in sections 4 and 5 above. Both are deferred because they
require either native entitlements (iCloud) or a full OAuth integration (Google Drive). Implement
after the app has shipped to the App Store and user demand is confirmed.

`
  ## 5. Google Drive backup

  **Problem:** The `driveBackup` toggle saves to AsyncStorage and does nothing.

  **What it actually requires:**
  1. A Google Cloud project with Drive API enabled
  2. OAuth 2.0 client ID (iOS type) configured in Google Cloud Console
  3. `expo-auth-session` for the OAuth flow
  4. Refresh token storage (so users don't have to re-auth every session)
  5. Drive API calls to upload the export file

  This is the most complex item on this list. It's a full OAuth integration with token management.

  **Step 1 — Install dependencies:**

  ```bash
  cd artifacts/margin
  npx expo install expo-auth-session expo-web-browser
  ```

  **Step 2 — Add to app.json:**

  ```json
  "scheme": "margin",
  "plugins": [
    ...,
    "expo-auth-session"
  ]
  ```

  **Step 3 — Add Google OAuth constants:**

  Create `artifacts/margin/lib/google.ts`:

  ```ts
  import * as AuthSession from "expo-auth-session";
  import * as WebBrowser from "expo-web-browser";

  WebBrowser.maybeCompleteAuthSession();

  const CLIENT_ID = "YOUR_GOOGLE_IOS_CLIENT_ID.apps.googleusercontent.com";
  const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

  export function useGoogleAuth() {
    const discovery = AuthSession.useAutoDiscovery("https://accounts.google.com");
    const redirectUri = AuthSession.makeRedirectUri({ scheme: "margin" });

    const [request, response, promptAsync] = AuthSession.useAuthRequest(
      {
        clientId: CLIENT_ID,
        scopes: SCOPES,
        redirectUri,
        responseType: AuthSession.ResponseType.Code,
        usePKCE: true,
      },
      discovery
    );

    return { request, response, promptAsync, redirectUri, discovery };
  }

  export async function uploadToDrive(
    accessToken: string,
    fileName: string,
    content: string,
  ): Promise<void> {
    const metadata = { name: fileName, mimeType: "text/plain" };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([content], { type: "text/plain" }));

    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      }
    );
    if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`);
  }
  ```

  **Step 4 — Wire the toggle** in `profile.tsx` using `useGoogleAuth()` and store the access token
  in AsyncStorage (or SecureStore) under `"margin:google_token"`. On subsequent sessions, check
  for a stored token before re-prompting.

  **Watch out for:**
  - Access tokens expire after 1 hour. You need to store the refresh token and exchange it for a
    new access token — the Google OAuth flow with `expo-auth-session` doesn't do this automatically.
    Handle 401 responses by refreshing before retrying.
  - The iOS OAuth client ID in Google Cloud Console must have the exact bundle identifier you set
    in `app.json`. A mismatch causes the redirect to fail silently.
  - App Store review: Apple requires that any Sign in with Google also offer Sign in with Apple.
    Since Margin uses email/password auth (not Google Sign-In for auth), this rule doesn't apply
    here — but mention "backup" in the feature description clearly, not "login with Google".

  --- 
`

### Home screen widget (N10)

A "On this day" or daily quote widget would pair well with the existing push notification
infrastructure. Deferred because it requires a native Widget Extension target (iOS 16+),
which is outside what Expo managed workflow supports without bare ejection or a custom dev
client. Revisit when the app has a stable build pipeline and native dev capacity.
