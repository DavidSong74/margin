# Margin — Remaining Work & Detailed Technical Specs

## Status at a glance

| # | Item | File / Location | Priority | Status |
|---|------|-----------------|----------|--------|
| **D1** | Fix App Store URL placeholder | `artifacts/margin/app/(tabs)/profile.tsx` | Low | ⏸ Blocked — needs App Store Connect ID |
| **SEC-01** | Fix `reorder_pages` SQL unique constraint crash | `supabase/migrations/` | 🔴 High | ⏳ Pending Implementation |
| **SEC-02** | Fix Android Supabase token truncation in `SecureStore` | `artifacts/margin/lib/supabase.ts` | 🟡 Medium | ⏳ Pending Implementation |
| **PERF-01** | Limit concurrency for multi-photo library import | `artifacts/margin/app/capture.tsx` | 🔴 High | ⏳ Pending Implementation |
| **PERF-02** | Refactor `transcribe` Edge Function to single-pass Gemini call | `supabase/functions/transcribe/index.ts` | 🔴 High | ⏳ Pending Implementation |
| **E4** | Verify Gemini API key & secrets in Supabase Vault | Supabase Dashboard | 🟡 Important | ⏳ Pending Verification |
| **D2** | iCloud Backup integration | `artifacts/margin/app/(tabs)/profile.tsx` | Low | ⏸ Deferred |
| **D3** | Google Drive Backup integration | `artifacts/margin/app/(tabs)/profile.tsx` | Low | ⏸ Deferred |
| **D4** | Home Screen Widget ("On This Day" / Streak) | `targets/` | Low | ⏸ Deferred |

---

## Context & Architecture Standards

- **Key AsyncStorage Key:** `"margin:settings"` — stores user settings as a JSON object.
- **Preferences:** Defined in [`artifacts/margin/app/(tabs)/profile.tsx`](file:///Users/songdavid93374/Projects/margin/artifacts/margin/app/(tabs)/profile.tsx) under the `Prefs` type. Any new setting must update the `Prefs` interface, `DEFAULT_PREFS`, the `current` object in `savePref()`, and the initial `useEffect` storage loader.
- **Supabase Client:** `import { supabase } from "@/lib/supabase"`.
- **UI & Styling:** Color tokens come from `import { useColors } from "@/hooks/useColors"`.
- **TypeScript:** Strict type definitions (`no implicit any`), explicit error handling, no non-null assertions unless value presence is guaranteed.

---

### D1. Fix App Store URL Placeholder

* **File:** [`artifacts/margin/app/(tabs)/profile.tsx`](file:///Users/songdavid93374/Projects/margin/artifacts/margin/app/(tabs)/profile.tsx#L1196-L1200)
* **Status:** ⏸ Blocked (Awaiting App Store Connect App ID)

#### Problem
The "Rate Margin" option in profile settings uses a placeholder URL (`https://apps.apple.com/app/idTODO`).

#### Exact Implementation Specification
1. Once the app is registered in App Store Connect and assigned an Apple ID (e.g. `id6740000000`), update lines 1196–1200 in `profile.tsx`.
2. Replace the current `Linking.openURL` handler with:
```tsx
<Row
  icon="star"
  label="Rate Margin"
  onPress={() => {
    const appStoreUrl = Platform.OS === "ios"
      ? "itms-apps://itunes.apple.com/app/id<APPLE_APP_ID>?action=write-review"
      : "https://apps.apple.com/app/id<APPLE_APP_ID>";
    Linking.openURL(appStoreUrl).catch(() =>
      Alert.alert("Error", "Could not open the App Store.")
    );
  }}
/>
```

---

### SEC-01. Fix `reorder_pages` Database Unique Constraint Violation

* **File:** [`supabase/migrations/007_page_reorder.sql`](file:///Users/songdavid93374/Projects/margin/supabase/migrations/007_page_reorder.sql#L28-L34)
* **Status:** 🔴 High Priority (Bug Fix)

#### Problem
In `007_page_reorder.sql`, `reorder_pages` updates `page_number = i` sequentially inside a `FOR` loop:
```sql
FOR i IN 1..array_length(p_page_ids, 1) LOOP
  UPDATE pages SET page_number = i WHERE id = p_page_ids[i] ...;
END LOOP;
```
Because the `pages` table enforces a unique constraint `UNIQUE (journal_id, page_number)` ([`001_init_schema.sql:L48`](file:///Users/songdavid93374/Projects/margin/supabase/migrations/001_init_schema.sql#L48)), updating page 2 to `page_number = 1` while page 1 is still at `1` instantly throws a SQL `unique_violation` error and aborts the transaction.

#### Exact Implementation Specification
1. Create a new migration file `supabase/migrations/013_fix_reorder_pages.sql`.
2. Replace `reorder_pages` using a two-phase update or a CTE with temporary offset:
```sql
-- Migration 013_fix_reorder_pages.sql
CREATE OR REPLACE FUNCTION public.reorder_pages(
  p_journal_id uuid,
  p_page_ids   uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- 1. Verify caller owns this journal
  IF NOT EXISTS (
    SELECT 1 FROM journals WHERE id = p_journal_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden: journal does not belong to caller';
  END IF;

  -- 2. Temporarily set page numbers to negative values to bypass UNIQUE(journal_id, page_number)
  UPDATE pages
  SET page_number = -page_number
  WHERE journal_id = p_journal_id
    AND deleted_at IS NULL;

  -- 3. Update sequential page_number matching array position in p_page_ids
  WITH new_order AS (
    SELECT u.page_id, u.ordinal AS new_num
    FROM unnest(p_page_ids) WITH ORDINALITY AS u(page_id, ordinal)
  )
  UPDATE pages p
  SET page_number = n.new_num
  FROM new_order n
  WHERE p.id = n.page_id
    AND p.journal_id = p_journal_id
    AND p.deleted_at IS NULL;
END;
$$;
```
3. Apply migration via `supabase db push` or SQL editor.

---

### SEC-02. Fix Android Token Truncation in Supabase `SecureStore` Adapter

* **File:** [`artifacts/margin/lib/supabase.ts`](file:///Users/songdavid93374/Projects/margin/artifacts/margin/lib/supabase.ts#L8-L18)
* **Status:** 🟡 Medium Priority (Platform Stability)

#### Problem
On Android, `expo-secure-store` uses SharedPreferences backed by Keystore with a hard limit of **2048 bytes** per key. Supabase auth sessions containing JWT access tokens, refresh tokens, and user metadata regularly exceed 2 KB, causing `SecureStore.setItemAsync` to fail silently or throw exceptions on Android.

#### Exact Implementation Specification
In `artifacts/margin/lib/supabase.ts`, replace `ExpoSecureStoreAdapter` with a chunked storage wrapper:

```typescript
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { Database } from "./database.types";

const CHUNK_SIZE = 2000;

const ChunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") return AsyncStorage.getItem(key);
    const countStr = await SecureStore.getItemAsync(`${key}_chunks`);
    if (!countStr) return SecureStore.getItemAsync(key);
    const count = parseInt(countStr, 10);
    let result = "";
    for (let i = 0; i < count; i++) {
      const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`);
      if (!chunk) return null;
      result += chunk;
    }
    return result;
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") return AsyncStorage.setItem(key, value);
    if (value.length <= CHUNK_SIZE) {
      await ChunkedSecureStore.removeItem(key);
      await SecureStore.setItemAsync(key, value);
      return;
    }
    await SecureStore.deleteItemAsync(key);
    const count = Math.ceil(value.length / CHUNK_SIZE);
    await SecureStore.setItemAsync(`${key}_chunks`, String(count));
    for (let i = 0; i < count; i++) {
      const chunk = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      await SecureStore.setItemAsync(`${key}_chunk_${i}`, chunk);
    }
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") return AsyncStorage.removeItem(key);
    const countStr = await SecureStore.getItemAsync(`${key}_chunks`);
    if (countStr) {
      const count = parseInt(countStr, 10);
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(`${key}_chunk_${i}`);
      }
      await SecureStore.deleteItemAsync(`${key}_chunks`);
    }
    await SecureStore.deleteItemAsync(key);
  },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env file."
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ChunkedSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

---

### PERF-01. Limit Concurrency for Multi-Photo Import

* **File:** [`artifacts/margin/app/capture.tsx`](file:///Users/songdavid93374/Projects/margin/artifacts/margin/app/capture.tsx#L360-L365)
* **Status:** 🔴 High Priority (Performance & Memory Spike)

#### Problem
In `capture.tsx`, `pickAndUploadPhotos` runs `Promise.all` over all assets selected from the device library:
```typescript
await Promise.all(
  result.assets.map((asset, i) => uploadSinglePhoto(asset.uri, base + i, user))
);
```
Selecting 15+ high-resolution photos runs multiple heavy image manipulations and base64 string conversions in JavaScript memory simultaneously, causing mobile app crashes (OOM) and triggering HTTP 429 rate limits on the `transcribe` Edge Function.

#### Exact Implementation Specification
In `artifacts/margin/app/capture.tsx`, update `pickAndUploadPhotos` to process uploads in controlled chunks of 2:

```typescript
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

  const { count } = await supabase
    .from("pages")
    .select("*", { count: "exact", head: true })
    .eq("journal_id", journal_id);
  const base = (count ?? 0) + 1;

  setScreen("batch_uploading");
  setBatchProgress({ current: 0, total: result.assets.length });

  try {
    const BATCH_SIZE = 2; // Process 2 assets at a time
    for (let i = 0; i < result.assets.length; i += BATCH_SIZE) {
      const chunk = result.assets.slice(i, i + BATCH_SIZE);
      await Promise.all(
        chunk.map((asset, idx) =>
          uploadSinglePhoto(asset.uri, base + i + idx, user)
        )
      );
      setBatchProgress({
        current: Math.min(i + BATCH_SIZE, result.assets.length),
        total: result.assets.length,
      });
    }
    router.replace({ pathname: "/journal/[id]", params: { id: journal_id } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    setUploadError(msg);
    setScreen("viewfinder");
  }
}, [journal_id, uploadSinglePhoto]);
```

---

### PERF-02. Refactor `transcribe` Edge Function to Single-Pass Gemini Call

* **File:** [`supabase/functions/transcribe/index.ts`](file:///Users/songdavid93374/Projects/margin/supabase/functions/transcribe/index.ts#L147-L186)
* **Status:** 🔴 High Priority (Latency & Token Cost Reduction)

#### Problem
`transcribe/index.ts` currently makes **two sequential HTTP calls** to Gemini Vision for every page processed (Pass 1 for full text, Pass 2 for uncertain words). This doubles latency (4–8 seconds per page) and doubles Gemini API input token billing.

#### Exact Implementation Specification
Refactor `supabase/functions/transcribe/index.ts` to request a single JSON object using Gemini's structured output capability (`responseMimeType: "application/json"`):

```typescript
// Replace Steps 7 & 8 in supabase/functions/transcribe/index.ts:

const systemInstructions = [
  "You are an expert at transcribing handwritten text from journal pages.",
  "Transcribe all visible handwritten text exactly as written, preserving line breaks.",
  "Identify any individual words you were uncertain about and suggest your best guess for each.",
  qualityInstruction,
  glossaryHint,
  "",
  'You MUST return a JSON object with this exact structure:',
  '{ "transcription": "<full text>", "uncertain_words": [{"original": "<word>", "suggested": "<guess>"}] }'
].filter(Boolean).join("\n\n");

const geminiModel = quality === "best" ? GEMINI_MODEL_PRO : GEMINI_MODEL_FLASH;

const rawJsonResponse = await callGemini(geminiKey, {
  systemInstruction: { parts: [{ text: systemInstructions }] },
  contents: [
    {
      role: "user",
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: base64Image } },
        { text: "Transcribe all handwritten text on this journal page and list uncertain words." },
      ],
    },
  ],
  generationConfig: {
    responseMimeType: "application/json",
  },
}, geminiModel);

let transcriptionText = "";
let pendingCorrections: Array<{ original: string; suggested: string }> = [];

try {
  const parsed = JSON.parse(rawJsonResponse);
  if (typeof parsed.transcription === "string") {
    transcriptionText = parsed.transcription;
  }
  if (Array.isArray(parsed.uncertain_words)) {
    pendingCorrections = parsed.uncertain_words.filter(
      (item: any) => typeof item?.original === "string" && typeof item?.suggested === "string"
    );
  }
} catch (e) {
  console.warn("[transcribe] Could not parse Gemini JSON response, falling back to raw string");
  transcriptionText = rawJsonResponse;
}

// Step 9: Write result in a single DB update
const { error: updateErr } = await adminClient
  .from("pages")
  .update({
    transcription_text: transcriptionText,
    transcription_status: "done",
    pending_corrections: pendingCorrections,
    correction_count: pendingCorrections.length,
  })
  .eq("id", page_id);
```

---

### E4. Verify Gemini API Key & Supabase Vault Secrets

* **Location:** Supabase Dashboard → Project Settings → Edge Functions → Secrets
* **Status:** 🟡 Important (Runtime Verification)

#### Problem
Without valid secret variables in the Supabase Edge Function environment, transcription calls return 500 errors.

#### Exact Verification & Setup Steps
1. Run CLI command or verify via Supabase Dashboard:
   ```bash
   supabase secrets set GEMINI_API_KEY=<your-active-gemini-key>
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
   ```
2. Verify secrets are accessible by Deno runtime in `supabase/functions/transcribe/index.ts`:
   - `Deno.env.get("GEMINI_API_KEY")`
   - `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`
   - `Deno.env.get("SUPABASE_URL")`
   - `Deno.env.get("SUPABASE_ANON_KEY")`

---

### D2. iCloud Backup Integration (Deferred Feature Specification)

* **File:** [`artifacts/margin/app/(tabs)/profile.tsx`](file:///Users/songdavid93374/Projects/margin/artifacts/margin/app/(tabs)/profile.tsx#L1059-L1064)
* **Status:** ⏸ Deferred

#### Technical Specification
1. When `iCloudBackup` toggle is enabled in `profile.tsx`:
   - Generate full archive file (`margin_backup.zip`) into `FileSystem.documentDirectory`.
   - On iOS, files saved in `FileSystem.documentDirectory` are included in automatic iCloud device backups unless explicitly excluded with key `NSURLIsExcludedFromBackupKey = true`.
2. Ensure `app.json` has `ios.supportsDocumentBrowser: true` if user-accessible files in Files app are desired.

---

### D3. Google Drive Backup Integration (Deferred Feature Specification)

* **File:** [`artifacts/margin/app/(tabs)/profile.tsx`](file:///Users/songdavid93374/Projects/margin/artifacts/margin/app/(tabs)/profile.tsx#L1065-L1071)
* **Status:** ⏸ Deferred

#### Technical Specification
1. Acquire Google OAuth `accessToken` during Google Sign-In using scope `https://www.googleapis.com/auth/drive.appdata` (App Data folder) or `https://www.googleapis.com/auth/drive.file`.
2. Create `lib/googleDrive.ts` with HTTP upload handler:
   ```typescript
   export async function uploadToGoogleDrive(accessToken: string, fileUri: string, filename: string) {
     const fileData = await FileSystem.readAsStringAsync(fileUri, { encoding: "base64" });
     const metadata = { name: filename, mimeType: "application/json", parents: ["appDataFolder"] };
     // Multipart upload to Google Drive v3 REST API
     const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
       method: "POST",
       headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
       body: JSON.stringify({ metadata, fileData })
     });
     return res.json();
   }
   ```

---

### D4. Home Screen Widget (Deferred Feature Specification)

* **Target Directory:** `artifacts/margin/targets/` (Expo Widget Extension)
* **Status:** ⏸ Deferred

#### Technical Specification
1. Create Expo Config Plugin for iOS WidgetKit (`targets/widget`) and Android AppWidget.
2. Store daily "On This Day" entry snippet and daily streak count in shared storage:
   - iOS: `AppGroup` shared container via `react-native-shared-group-preferences`.
   - Android: `SharedPreferences` shared container.
3. In `_layout.tsx`, write stats & memory snippet to AppGroup key `"margin_widget_data"` on AppState `background`.
