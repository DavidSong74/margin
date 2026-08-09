# Margin — Remaining Features

## Status at a glance

| # | Feature | Status |
|---|---------|--------|
| O1 | Drop `p_user_id` from `save_correction` | ✅ Done |
| O2 | Collapse `fetchJournals` round trips | ✅ Done |
| O3 | Pass `is_private` as route param | ✅ Done |
| O4 | Guard `registerPushToken` to SIGNED_IN only | ✅ Done |
| N1 | Dark mode / theme system | 📋 To do |
| N2 | AI transcription quality selector | ✅ Done |
| N3 | Change password | ✅ Done |
| N4 | Export full archive | ✅ Done |
| N5 | Default cover color preference | ✅ Done |
| N6 | Rate / Feedback / Help links | ✅ Done |
| N7 | Offline capture queue | ✅ Done |
| N8 | Share a page | ✅ Done |
| N9 | Search within a single journal | ✅ Done |
| S1 | Social: data model (SQL) | ✅ Done — run `011_social.sql` in Supabase SQL Editor |
| S2 | Social: inbox overlay + friend search | 📋 To do |
| S3 | Social: share from journal reader | 📋 To do |
| S4 | Social: Feed tab | 📋 To do |
| S5 | Social: likes + comments | 📋 To do |
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

---

## Social features (S1–S5)

> **Prerequisite order:** S1 must be done first (SQL). S2, S3, S4 can be done in parallel after S1. S5 depends on S4.

---

### S1. Data model — run all SQL in Supabase SQL Editor

Create a new migration file `supabase/migrations/010_social.sql` with all of the following, then run it in the Supabase SQL Editor.

```sql
-- ── User profiles (public, searchable by email) ──────────────────────────────
-- Supabase auth.users is not directly queryable from the client.
-- This view exposes only the safe fields we need for friend search.
CREATE OR REPLACE VIEW public.user_email_lookup AS
  SELECT id AS user_id, email
  FROM auth.users;

-- RLS: any authenticated user can query (email is already semi-public in this context)
ALTER VIEW public.user_email_lookup OWNER TO authenticated;

-- RPC to search by email — SECURITY DEFINER so it can read auth.users safely
CREATE OR REPLACE FUNCTION public.find_user_by_email(p_email text)
RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id AS user_id, email
  FROM auth.users
  WHERE lower(email) = lower(p_email)
    AND id <> auth.uid()   -- can't friend yourself
  LIMIT 1;
$$;

-- ── Friendships ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.friendships (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending'  -- 'pending' | 'accepted' | 'declined'
                CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Each user sees requests they sent or received
CREATE POLICY "friendships: select own" ON public.friendships
  FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "friendships: insert as requester" ON public.friendships
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

-- Only addressee can update (accept/decline)
CREATE POLICY "friendships: update as addressee" ON public.friendships
  FOR UPDATE USING (auth.uid() = addressee_id);

-- Either party can delete (unfriend)
CREATE POLICY "friendships: delete own" ON public.friendships
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- RPC: returns mutual friends (both sides accepted)
CREATE OR REPLACE FUNCTION public.get_friends()
RETURNS TABLE (friend_id uuid, friend_email text)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, auth
AS $$
  SELECT
    CASE WHEN f.requester_id = auth.uid() THEN f.addressee_id ELSE f.requester_id END AS friend_id,
    u.email AS friend_email
  FROM friendships f
  JOIN auth.users u ON u.id = CASE WHEN f.requester_id = auth.uid() THEN f.addressee_id ELSE f.requester_id END
  WHERE (f.requester_id = auth.uid() OR f.addressee_id = auth.uid())
    AND f.status = 'accepted';
$$;

-- RPC: pending incoming requests
CREATE OR REPLACE FUNCTION public.get_pending_friend_requests()
RETURNS TABLE (friendship_id uuid, requester_id uuid, requester_email text, created_at timestamptz)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, auth
AS $$
  SELECT f.id, f.requester_id, u.email, f.created_at
  FROM friendships f
  JOIN auth.users u ON u.id = f.requester_id
  WHERE f.addressee_id = auth.uid()
    AND f.status = 'pending'
  ORDER BY f.created_at DESC;
$$;

-- ── Notifications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text NOT NULL,   -- 'friend_request' | 'friend_accepted' | 'on_this_day'
  data       jsonb NOT NULL DEFAULT '{}',
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications: own" ON public.notifications
  FOR ALL USING (auth.uid() = user_id);

-- Trigger: create a notification when a friend request is sent
CREATE OR REPLACE FUNCTION public.notify_friend_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, data)
    VALUES (
      NEW.addressee_id,
      'friend_request',
      jsonb_build_object('friendship_id', NEW.id, 'requester_id', NEW.requester_id)
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_friend_request
AFTER INSERT ON public.friendships
FOR EACH ROW WHEN (NEW.status = 'pending')
EXECUTE FUNCTION public.notify_friend_request();

-- Trigger: notify when a request is accepted
CREATE OR REPLACE FUNCTION public.notify_friend_accepted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, type, data)
      VALUES (
        NEW.requester_id,
        'friend_accepted',
        jsonb_build_object('friendship_id', NEW.id, 'addressee_id', NEW.addressee_id)
      );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_friend_accepted
AFTER UPDATE ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.notify_friend_accepted();

-- ── Shared entries (what appears in the Feed) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shared_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- page_ids stores the 1-5 pages included in this share (may be empty if sharing a text snippet only)
  page_ids    uuid[] NOT NULL DEFAULT '{}',
  -- shared_text is the exact text visible in the feed (either selected snippet or full page transcriptions joined)
  shared_text text NOT NULL,
  -- original journal context for display
  journal_id  uuid REFERENCES public.journals(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_entries ENABLE ROW LEVEL SECURITY;

-- Author can manage their own shares
CREATE POLICY "shared_entries: author" ON public.shared_entries
  FOR ALL USING (auth.uid() = user_id);

-- Mutual friends can read
CREATE POLICY "shared_entries: friends can read" ON public.shared_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.requester_id = auth.uid() AND f.addressee_id = shared_entries.user_id) OR
          (f.addressee_id = auth.uid() AND f.requester_id = shared_entries.user_id)
        )
    )
  );

-- RPC: feed for current user (shared entries from mutual friends, newest first)
CREATE OR REPLACE FUNCTION public.get_feed()
RETURNS TABLE (
  entry_id    uuid,
  author_id   uuid,
  author_email text,
  shared_text text,
  journal_id  uuid,
  created_at  timestamptz,
  like_count  bigint,
  comment_count bigint,
  viewer_liked  boolean
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, auth
AS $$
  SELECT
    se.id,
    se.user_id,
    u.email,
    se.shared_text,
    se.journal_id,
    se.created_at,
    COUNT(DISTINCT fl.id) AS like_count,
    COUNT(DISTINCT fc.id) AS comment_count,
    EXISTS (SELECT 1 FROM feed_likes fl2 WHERE fl2.shared_entry_id = se.id AND fl2.user_id = auth.uid()) AS viewer_liked
  FROM shared_entries se
  JOIN auth.users u ON u.id = se.user_id
  LEFT JOIN feed_likes fl ON fl.shared_entry_id = se.id
  LEFT JOIN feed_comments fc ON fc.shared_entry_id = se.id
  WHERE EXISTS (
    SELECT 1 FROM friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.requester_id = auth.uid() AND f.addressee_id = se.user_id) OR
        (f.addressee_id = auth.uid() AND f.requester_id = se.user_id)
      )
  )
  GROUP BY se.id, se.user_id, u.email, se.shared_text, se.journal_id, se.created_at
  ORDER BY se.created_at DESC
  LIMIT 50;
$$;

-- ── Feed likes ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feed_likes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_entry_id uuid NOT NULL REFERENCES public.shared_entries(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, shared_entry_id)
);

ALTER TABLE public.feed_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feed_likes: own" ON public.feed_likes
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "feed_likes: friends can read" ON public.feed_likes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM shared_entries se
      JOIN friendships f ON f.status = 'accepted'
        AND ((f.requester_id = auth.uid() AND f.addressee_id = se.user_id) OR
             (f.addressee_id = auth.uid() AND f.requester_id = se.user_id))
      WHERE se.id = feed_likes.shared_entry_id
    )
  );

-- ── Feed comments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feed_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_entry_id uuid NOT NULL REFERENCES public.shared_entries(id) ON DELETE CASCADE,
  text            text NOT NULL CHECK (char_length(text) > 0 AND char_length(text) <= 500),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feed_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feed_comments: own" ON public.feed_comments
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "feed_comments: friends can read" ON public.feed_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM shared_entries se
      JOIN friendships f ON f.status = 'accepted'
        AND ((f.requester_id = auth.uid() AND f.addressee_id = se.user_id) OR
             (f.addressee_id = auth.uid() AND f.requester_id = se.user_id))
      WHERE se.id = feed_comments.shared_entry_id
    )
  );

-- RPC: get comments for a single shared entry (caller must be a mutual friend of the author)
CREATE OR REPLACE FUNCTION public.get_comments(p_entry_id uuid)
RETURNS TABLE (comment_id uuid, user_id uuid, author_email text, text text, created_at timestamptz)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, auth
AS $$
  SELECT fc.id, fc.user_id, u.email, fc.text, fc.created_at
  FROM feed_comments fc
  JOIN auth.users u ON u.id = fc.user_id
  WHERE fc.shared_entry_id = p_entry_id
  ORDER BY fc.created_at ASC;
$$;
```

Add the new types to `lib/database.types.ts`:

```ts
friendships: { Row: { id: string; requester_id: string; addressee_id: string; status: "pending"|"accepted"|"declined"; created_at: string }; Insert: { requester_id: string; addressee_id: string; status?: string }; Update: { status?: string }; Relationships: [] };
notifications: { Row: { id: string; user_id: string; type: string; data: Json; read: boolean; created_at: string }; Insert: { user_id: string; type: string; data?: Json }; Update: { read?: boolean }; Relationships: [] };
shared_entries: { Row: { id: string; user_id: string; page_ids: string[]; shared_text: string; journal_id: string|null; created_at: string }; Insert: { user_id: string; page_ids?: string[]; shared_text: string; journal_id?: string|null }; Update: Partial<...>; Relationships: [] };
feed_likes: { Row: { id: string; user_id: string; shared_entry_id: string; created_at: string }; Insert: { user_id: string; shared_entry_id: string }; Update: {}; Relationships: [] };
feed_comments: { Row: { id: string; user_id: string; shared_entry_id: string; text: string; created_at: string }; Insert: { user_id: string; shared_entry_id: string; text: string }; Update: {}; Relationships: [] };
```

Also add the new RPCs:
```ts
find_user_by_email: { Args: { p_email: string }; Returns: Array<{ user_id: string; email: string }> };
get_friends: { Args: Record<string,never>; Returns: Array<{ friend_id: string; friend_email: string }> };
get_pending_friend_requests: { Args: Record<string,never>; Returns: Array<{ friendship_id: string; requester_id: string; requester_email: string; created_at: string }> };
get_feed: { Args: Record<string,never>; Returns: Array<{ entry_id: string; author_id: string; author_email: string; shared_text: string; journal_id: string|null; created_at: string; like_count: number; comment_count: number; viewer_liked: boolean }> };
get_comments: { Args: { p_entry_id: string }; Returns: Array<{ comment_id: string; user_id: string; author_email: string; text: string; created_at: string }> };
```

---

### S2. Inbox overlay + friend search

**New file:** `artifacts/margin/components/InboxOverlay.tsx`

**Modified file:** `artifacts/margin/app/(tabs)/index.tsx` — add inbox button to header

---

#### Step 1 — Add the inbox button to the Library header

In `index.tsx`, find the existing header section and add a `TouchableOpacity` wrapping the "M" logo in the top-right. Add `inboxVisible` state and an unread count:

```tsx
const [inboxVisible, setInboxVisible] = useState(false);
const [unreadCount, setUnreadCount] = useState(0);

// In the header JSX, replace or wrap the existing "M" icon:
<TouchableOpacity onPress={() => setInboxVisible(true)} style={styles.inboxBtn}>
  <Text style={[styles.logoM, { color: colors.primary }]}>M</Text>
  {unreadCount > 0 && (
    <View style={[styles.badge, { backgroundColor: colors.destructive }]}>
      <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : String(unreadCount)}</Text>
    </View>
  )}
</TouchableOpacity>

// Add to StyleSheet:
inboxBtn: { position: "relative" },
logoM: { fontSize: 22, fontFamily: "PlayfairDisplay_700Bold" },
badge: { position: "absolute", top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
badgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
```

Fetch unread count on mount and on focus:

```tsx
const fetchUnreadCount = useCallback(async () => {
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("read", false);
  setUnreadCount(count ?? 0);
}, []);

useFocusEffect(useCallback(() => { fetchUnreadCount(); }, [fetchUnreadCount]));
```

Pass `inboxVisible`, `setInboxVisible`, and `onNotificationsRead` (callback to re-fetch count) as props to `<InboxOverlay>`.

---

#### Step 2 — Build InboxOverlay component

Create `artifacts/margin/components/InboxOverlay.tsx`. This is a `Modal` with `transparent={true}` that slides in from the top-right without navigating away from the Library screen.

**State it manages:**
- `searchEmail: string` — the email being typed in the search field
- `searchResult: { user_id: string; email: string } | null | "not_found"` — result of email lookup
- `pendingRequests: Array<{ friendship_id, requester_id, requester_email, created_at }>`
- `notifications: Array<{ id, type, data, read, created_at }>`
- `friends: Array<{ friend_id, friend_email }>`
- `loading: boolean`

**Layout:**

```tsx
<Modal
  visible={visible}
  transparent
  animationType="fade"
  onRequestClose={onClose}
>
  {/* Backdrop — tapping outside closes */}
  <Pressable style={styles.backdrop} onPress={onClose} />

  {/* Panel — anchored top-right, full height of screen */}
  <View style={[styles.panel, { backgroundColor: colors.card }]}>
    {/* Header */}
    <View style={styles.panelHeader}>
      <Text style={styles.panelTitle}>Inbox</Text>
      <TouchableOpacity onPress={onClose}><Feather name="x" size={20} /></TouchableOpacity>
    </View>

    {/* Friend search */}
    <View style={styles.searchSection}>
      <Text style={styles.sectionLabel}>Add a friend</Text>
      <TextInput
        placeholder="Search by email"
        value={searchEmail}
        onChangeText={setSearchEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        returnKeyType="search"
        onSubmitEditing={handleSearch}
        style={styles.searchInput}
      />
      {/* Show result and "Add friend" button */}
      {searchResult === "not_found" && <Text>No user found.</Text>}
      {searchResult && searchResult !== "not_found" && (
        <View style={styles.searchResult}>
          <Text>{searchResult.email}</Text>
          <TouchableOpacity onPress={() => handleSendRequest(searchResult.user_id)}>
            <Text>Add friend</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>

    {/* Friends list */}
    <Text style={styles.sectionLabel}>Friends ({friends.length})</Text>
    {friends.map((f) => (
      <View key={f.friend_id} style={styles.friendRow}>
        <Text>{f.friend_email}</Text>
      </View>
    ))}

    {/* Pending requests + notifications */}
    <Text style={styles.sectionLabel}>Notifications</Text>
    <FlatList
      data={allNotifications}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <NotificationRow item={item} onAccept={handleAccept} onDecline={handleDecline} />}
    />
  </View>
</Modal>
```

**StyleSheet for the panel:**
```tsx
backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
panel: { position: "absolute", top: 0, right: 0, width: "80%", maxWidth: 340, height: "100%", padding: 20, paddingTop: 60, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20 },
```

**Key handlers:**

```tsx
async function handleSearch() {
  if (!searchEmail.trim()) return;
  const { data } = await supabase.rpc("find_user_by_email", { p_email: searchEmail.trim() });
  setSearchResult(data?.length ? data[0] : "not_found");
}

async function handleSendRequest(addresseeId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await supabase.from("friendships").insert({ requester_id: session.user.id, addressee_id: addresseeId });
  setSearchResult(null);
  setSearchEmail("");
  Alert.alert("Request sent!");
}

async function handleAccept(friendshipId: string) {
  await supabase.from("friendships").update({ status: "accepted" }).eq("id", friendshipId);
  await supabase.from("notifications").update({ read: true })
    .eq("type", "friend_request")
    .contains("data", { friendship_id: friendshipId });
  fetchAll(); // re-fetch state
  onNotificationsRead();
}

async function handleDecline(friendshipId: string) {
  await supabase.from("friendships").update({ status: "declined" }).eq("id", friendshipId);
  fetchAll();
}
```

Mark all notifications as read when the overlay opens:
```tsx
useEffect(() => {
  if (visible) {
    fetchAll();
    supabase.from("notifications").update({ read: true }).eq("read", false).then(() => {
      onNotificationsRead(); // clears the red badge
    });
  }
}, [visible]);
```

**NotificationRow subcomponent** renders differently based on `item.type`:
- `friend_request`: shows requester email + Accept / Decline buttons
- `friend_accepted`: shows "X accepted your friend request"
- `on_this_day`: shows the notification message text from `item.data.message`

---

### S3. Share from journal reader

**Modified file:** `artifacts/margin/app/journal/[id].tsx`

Two separate share paths — implement both:

---

#### Path A: Share button (page picker)

Add a `Share` button to the header, to the left of the existing `Edit` toggle (and the `Retry` button). Only visible when `!editMode`.

```tsx
// New state:
const [shareMode, setShareMode] = useState(false);
const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
const [shareModalVisible, setShareModalVisible] = useState(false);
```

When the user taps `Share`, open a modal (`shareModalVisible = true`) showing all pages as a scrollable list of thumbnails. Each thumbnail has a checkbox. The user selects 1–5 pages.

```tsx
// Share modal JSX (similar structure to existing reorder modal)
<Modal visible={shareModalVisible} animationType="slide">
  <View style={styles.reorderRoot}>
    <View style={styles.reorderHeader}>
      <Text style={styles.reorderTitle}>Select pages to share</Text>
      <Text style={styles.reorderSubtitle}>{selectedPageIds.length}/5 selected</Text>
    </View>
    <FlatList
      data={pages}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[styles.sharePageRow, selectedPageIds.includes(item.id) && styles.sharePageSelected]}
          onPress={() => togglePageSelection(item.id)}
          disabled={!selectedPageIds.includes(item.id) && selectedPageIds.length >= 5}
        >
          <Image source={{ uri: getThumbnailUrl(item.thumbnailPath) }} style={styles.reorderThumb} />
          <Text style={styles.reorderPageLabel}>Page {item.pageNumber}</Text>
          <Text numberOfLines={2} style={styles.shareSnippet}>{item.transcriptionText ?? "No transcription"}</Text>
          {selectedPageIds.includes(item.id) && <Feather name="check-circle" size={20} color={colors.primary} />}
        </TouchableOpacity>
      )}
    />
    <View style={styles.shareActions}>
      <TouchableOpacity onPress={() => setShareModalVisible(false)} style={styles.reorderCancel}>
        <Text>Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleSharePages}
        disabled={selectedPageIds.length === 0}
        style={[styles.reorderSave, { opacity: selectedPageIds.length === 0 ? 0.4 : 1 }]}
      >
        <Text style={styles.reorderActionText}>Share to Feed</Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal>
```

```tsx
function togglePageSelection(pageId: string) {
  setSelectedPageIds((prev) =>
    prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]
  );
}

async function handleSharePages() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const selectedPages = pages.filter((p) => selectedPageIds.includes(p.id));
  const sharedText = selectedPages
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((p) => p.transcriptionText ?? "")
    .filter(Boolean)
    .join("\n\n---\n\n");

  if (!sharedText.trim()) {
    Alert.alert("Nothing to share", "Selected pages have no transcription yet.");
    return;
  }

  await supabase.from("shared_entries").insert({
    user_id: session.user.id,
    page_ids: selectedPageIds,
    shared_text: sharedText,
    journal_id: journalId,
  });

  setShareModalVisible(false);
  setSelectedPageIds([]);
  Alert.alert("Shared!", "Your entry is now visible to your friends in their Feed.");
}
```

---

#### Path B: Text selection → Share snippet

The transcription text in the reader is currently rendered in a plain `Text` component. To support text selection with a "Share" action, switch the transcription display to a `TextInput` in read-only mode:

```tsx
// Replace the transcription Text component with:
<TextInput
  value={pages[currentPage]?.transcriptionText ?? ""}
  editable={false}
  multiline
  scrollEnabled={false}
  selectionColor={colors.primary + "60"}
  style={[styles.transcriptionText, { color: colors.foreground }]}
  onSelectionChange={(e) => {
    const { start, end } = e.nativeEvent.selection;
    if (end > start) setTextSelection({ start, end });
    else setTextSelection(null);
  }}
/>
```

Add state: `const [textSelection, setTextSelection] = useState<{ start: number; end: number } | null>(null);`

When `textSelection` is non-null, show a floating action bar above the keyboard:

```tsx
{textSelection && (
  <View style={[styles.selectionBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <TouchableOpacity onPress={handleShareSelection} style={styles.selectionAction}>
      <Feather name="share" size={16} color={colors.primary} />
      <Text style={[styles.selectionActionText, { color: colors.primary }]}>Share to Feed</Text>
    </TouchableOpacity>
    <TouchableOpacity onPress={() => setTextSelection(null)} style={styles.selectionAction}>
      <Feather name="x" size={16} color={colors.mutedForeground} />
    </TouchableOpacity>
  </View>
)}
```

```tsx
async function handleShareSelection() {
  if (!textSelection) return;
  const page = pages[currentPage];
  const fullText = page?.transcriptionText ?? "";
  const snippet = fullText.slice(textSelection.start, textSelection.end).trim();
  if (!snippet) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  await supabase.from("shared_entries").insert({
    user_id: session.user.id,
    page_ids: [page.id],
    shared_text: snippet,
    journal_id: journalId,
  });

  setTextSelection(null);
  Alert.alert("Shared!", "Your snippet is now visible to your friends.");
}
```

Add styles: `selectionBar` (flexDirection row, position absolute, bottom above keyboard, left 0, right 0, padding 12, borderTopWidth 1, gap 16), `selectionAction` (flexDirection row, alignItems center, gap 6), `selectionActionText` (fontSize 14, fontFamily Inter_600SemiBold).

**Watch out for:** On iOS, switching from a `Text` to `TextInput editable={false}` changes scroll behavior — the transcription is inside a `ScrollView` and `TextInput` nested in `ScrollView` can fight for scroll events. Fix by setting `scrollEnabled={false}` on the `TextInput` and keeping the outer scroll intact.

---

### S4. Feed tab

**New file:** `artifacts/margin/app/(tabs)/feed.tsx`

**Modified file:** `artifacts/margin/app/(tabs)/_layout.tsx` — add Feed tab

---

#### Step 1 — Add the tab in `_layout.tsx`

```tsx
<Tabs.Screen
  name="feed"
  options={{
    title: "Feed",
    tabBarIcon: ({ color }) => <Feather name="users" size={22} color={color} />,
  }}
/>
```

> **Important:** The bottom tab bar currently has 4 tabs. Adding a 5th narrows each tab. Test
> on a small screen (iPhone SE) to confirm nothing clips. If it's crowded, replace the tab labels
> with icons-only by setting `tabBarShowLabel: false` globally in the tab bar options.

---

#### Step 2 — Build `feed.tsx`

**State:**
```tsx
type FeedEntry = {
  entry_id: string;
  author_id: string;
  author_email: string;
  shared_text: string;
  journal_id: string | null;
  created_at: string;
  like_count: number;
  comment_count: number;
  viewer_liked: boolean;
};

const [entries, setEntries] = useState<FeedEntry[]>([]);
const [loading, setLoading] = useState(true);
const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
const [commentEntryId, setCommentEntryId] = useState<string | null>(null);
```

**Fetch on focus:**
```tsx
useFocusEffect(useCallback(() => {
  supabase.rpc("get_feed").then(({ data }) => {
    setEntries(data ?? []);
    setLoading(false);
  });
}, []));
```

**FeedCard component** (memoize with `React.memo`):

```tsx
interface FeedCardProps {
  entry: FeedEntry;
  colors: ReturnType<typeof useColors>;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onLike: (id: string) => void;
  onOpenComments: (id: string) => void;
}

const FeedCard = React.memo(function FeedCard({ entry, colors, isExpanded, onToggleExpand, onLike, onOpenComments }: FeedCardProps) {
  const TEXT_LINE_LIMIT = 10;
  const lines = entry.shared_text.split("\n");
  const isTruncated = lines.length > TEXT_LINE_LIMIT;
  const displayText = isExpanded || !isTruncated
    ? entry.shared_text
    : lines.slice(0, TEXT_LINE_LIMIT).join("\n") + "…";
  const dateStr = new Date(entry.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Author + date */}
      <View style={styles.cardHeader}>
        <Text style={[styles.authorEmail, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          {entry.author_email}
        </Text>
        <Text style={[styles.cardDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {dateStr}
        </Text>
      </View>

      {/* Transcription text */}
      <TouchableOpacity onPress={() => isTruncated && onToggleExpand(entry.entry_id)} activeOpacity={isTruncated ? 0.7 : 1}>
        <Text style={[styles.entryText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
          {displayText}
        </Text>
        {isTruncated && !isExpanded && (
          <Text style={[styles.showMore, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
            Show more
          </Text>
        )}
        {isExpanded && isTruncated && (
          <Text style={[styles.showMore, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
            Show less
          </Text>
        )}
      </TouchableOpacity>

      {/* Actions row */}
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => onLike(entry.entry_id)} style={styles.actionBtn}>
          <Feather
            name="heart"
            size={18}
            color={entry.viewer_liked ? colors.destructive : colors.mutedForeground}
          />
          {entry.like_count > 0 && (
            <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{entry.like_count}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onOpenComments(entry.entry_id)} style={styles.actionBtn}>
          <Feather name="message-circle" size={18} color={colors.mutedForeground} />
          {entry.comment_count > 0 && (
            <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{entry.comment_count}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
});
```

**Like handler** (optimistic update):
```tsx
const handleLike = useCallback(async (entryId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const entry = entries.find((e) => e.entry_id === entryId);
  if (!entry) return;

  if (entry.viewer_liked) {
    // Unlike
    setEntries((prev) => prev.map((e) => e.entry_id === entryId
      ? { ...e, viewer_liked: false, like_count: e.like_count - 1 } : e));
    await supabase.from("feed_likes")
      .delete().eq("shared_entry_id", entryId).eq("user_id", session.user.id);
  } else {
    // Like
    setEntries((prev) => prev.map((e) => e.entry_id === entryId
      ? { ...e, viewer_liked: true, like_count: e.like_count + 1 } : e));
    await supabase.from("feed_likes")
      .insert({ user_id: session.user.id, shared_entry_id: entryId });
  }
}, [entries]);
```

**Screen JSX:**
```tsx
return (
  <View style={[styles.root, { backgroundColor: colors.background }]}>
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Text style={[styles.title, { color: colors.foreground, fontFamily: "PlayfairDisplay_700Bold" }]}>
        Feed
      </Text>
    </View>

    {loading ? (
      <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />
    ) : entries.length === 0 ? (
      <View style={styles.empty}>
        <Feather name="users" size={40} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nothing here yet</Text>
        <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
          Add friends from the inbox (tap M in the Library) and ask them to share a journal entry.
        </Text>
      </View>
    ) : (
      <FlatList
        data={entries}
        keyExtractor={(e) => e.entry_id}
        renderItem={({ item }) => (
          <FeedCard
            entry={item}
            colors={colors}
            isExpanded={expandedIds.has(item.entry_id)}
            onToggleExpand={(id) => setExpandedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })}
            onLike={handleLike}
            onOpenComments={setCommentEntryId}
          />
        )}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 80 }}
      />
    )}

    {/* Comments bottom sheet — see S5 */}
    <CommentsSheet entryId={commentEntryId} onClose={() => setCommentEntryId(null)} />
  </View>
);
```

**Styles to add:** `root` (flex 1), `header` (paddingHorizontal 20, paddingBottom 12), `title` (fontSize 24), `empty` (flex 1, alignItems center, justifyContent center, padding 40, gap 12), `emptyTitle` (fontSize 20, fontFamily PlayfairDisplay_600SemiBold), `emptyBody` (fontSize 14, textAlign center, lineHeight 20), `card` (borderRadius 14, borderWidth 1, padding 16, gap 10), `cardHeader` (flexDirection row, justifyContent space-between, alignItems flex-start), `authorEmail` (fontSize 14, flex 1), `cardDate` (fontSize 12), `entryText` (fontSize 15, lineHeight 24), `showMore` (fontSize 13, marginTop 4), `cardActions` (flexDirection row, gap 20, marginTop 4), `actionBtn` (flexDirection row, alignItems center, gap 5), `actionCount` (fontSize 13).

---

### S5. Comments bottom sheet

**New component:** `artifacts/margin/components/CommentsSheet.tsx`

This is a `Modal` (or a `BottomSheet` from `@gorhom/bottom-sheet` if that library is installed) that slides up from the bottom when the comment icon is tapped.

```tsx
interface CommentsSheetProps {
  entryId: string | null;  // null = closed
  onClose: () => void;
}
```

**State:** `comments: Comment[]`, `newText: string`, `sending: boolean`

**Fetch comments on open:**
```tsx
useEffect(() => {
  if (!entryId) return;
  supabase.rpc("get_comments", { p_entry_id: entryId }).then(({ data }) => setComments(data ?? []));
}, [entryId]);
```

**Post a comment:**
```tsx
async function handleSend() {
  if (!newText.trim() || !entryId) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  setSending(true);
  const { data } = await supabase
    .from("feed_comments")
    .insert({ user_id: session.user.id, shared_entry_id: entryId, text: newText.trim() })
    .select()
    .single();
  if (data) {
    setComments((prev) => [...prev, { ...data, author_email: session.user.email! }]);
  }
  setNewText("");
  setSending(false);
}
```

**Layout:**
```tsx
<Modal visible={!!entryId} transparent animationType="slide" onRequestClose={onClose}>
  <Pressable style={styles.backdrop} onPress={onClose} />
  <View style={[styles.sheet, { backgroundColor: colors.card }]}>
    <View style={styles.sheetHandle} />
    <Text style={styles.sheetTitle}>Comments</Text>
    <FlatList
      data={comments}
      keyExtractor={(c) => c.comment_id}
      renderItem={({ item }) => (
        <View style={styles.commentRow}>
          <Text style={[styles.commentAuthor, { color: colors.primary }]}>{item.author_email}</Text>
          <Text style={[styles.commentText, { color: colors.foreground }]}>{item.text}</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={{ color: colors.mutedForeground, textAlign: "center", marginTop: 16 }}>No comments yet.</Text>}
    />
    {/* Input row */}
    <View style={[styles.inputRow, { borderTopColor: colors.border }]}>
      <TextInput
        value={newText}
        onChangeText={setNewText}
        placeholder="Add a comment…"
        placeholderTextColor={colors.mutedForeground}
        style={[styles.commentInput, { color: colors.foreground }]}
        maxLength={500}
        returnKeyType="send"
        onSubmitEditing={handleSend}
      />
      {sending
        ? <ActivityIndicator size="small" color={colors.primary} />
        : <TouchableOpacity onPress={handleSend} disabled={!newText.trim()}>
            <Feather name="send" size={20} color={newText.trim() ? colors.primary : colors.mutedForeground} />
          </TouchableOpacity>
      }
    </View>
  </View>
</Modal>
```

**Styles:** `backdrop` (flex 1, backgroundColor rgba(0,0,0,0.4)), `sheet` (position absolute, bottom 0, left 0, right 0, height "60%", borderTopLeftRadius 20, borderTopRightRadius 20, padding 16, gap 8), `sheetHandle` (alignSelf center, width 40, height 4, borderRadius 2, backgroundColor border), `sheetTitle` (fontSize 17, fontFamily Inter_600SemiBold), `commentRow` (gap 2, paddingVertical 8), `commentAuthor` (fontSize 12, fontFamily Inter_600SemiBold), `commentText` (fontSize 14, lineHeight 20), `inputRow` (flexDirection row, alignItems center, gap 10, borderTopWidth StyleSheet.hairlineWidth, paddingTop 10), `commentInput` (flex 1, fontSize 15).

---

### Watch out for (social features overall)

- **Email search privacy:** `find_user_by_email` is `SECURITY DEFINER` and returns any email that matches. This is intentional (users must know the exact email) but means users can verify whether any email has a Margin account. Accept this tradeoff for v1; rate-limit the RPC in the Edge Function if abuse becomes a concern.

- **Feed RLS:** The `shared_entries` "friends can read" policy uses a correlated subquery that runs per-row. On large datasets this is slow. For v1 with small friend lists this is fine. At scale, denormalize with a `friendship_cache` table or use Postgres row-level caching.

- **Deleting a share:** Add a long-press action on your own feed cards (visible only to the author) that calls `supabase.from("shared_entries").delete().eq("id", entryId)`. Not yet implemented — add as a follow-up.

- **`TextInput editable={false}` scroll conflict:** On Android, `TextInput` inside `ScrollView` steals vertical scroll events. Wrap the `TextInput` in a `View` with `pointerEvents="box-none"` on Android (`Platform.OS === "android"`) and test scrolling through long transcriptions.

- **5th tab bar icon:** Expo Router's `(tabs)` layout picks up files alphabetically. `feed.tsx` comes before `index.tsx`, which will reorder the tabs. Set explicit `tabBarItemStyle` or use the `href` ordering in `_layout.tsx` to control tab order. Desired order: Library, Search, Capture, Review, Feed.

- **Mutual-only feed:** `get_feed()` correctly filters to `status = 'accepted'` friendships. If a friendship is deleted after entries are shared, those entries disappear from the ex-friend's feed automatically (the RLS policy re-evaluates on every query).
