# Margin — Pending Engineering Tasks & Detailed Technical Specifications

> **File Location:** `todo_claude.md`  
> **Last Updated:** August 14, 2026  
> **Status:** All completed tasks (`SEC-01`, `SEC-02`, `PERF-01`, `PERF-02`, Adaptive Icon) have been removed. The remaining pending tasks below contain hyper-specific implementation details so nothing is left to guess.

---

## Status at a Glance

| # | Item | Target File(s) | Category | Status / Priority |
|---|------|----------------|----------|-------------------|
| **SEC-03** | Prevent user email enumeration in friend lookup RPC | `supabase/migrations/015_fix_email_search.sql` | Security | ✅ Completed |
| **SEC-04** | Fix path traversal check in production web server | `artifacts/margin/server/serve.js` | Security | ✅ Completed |
| **SEC-05** | Sanitize dev login credentials in client bundle | `artifacts/margin/app/index.tsx` | Security | ✅ Verified / Completed |
| **PERF-03** | Add partial composite DB indexes for active pages & likes | `supabase/migrations/016_performance_indexes.sql` | Performance | ✅ Completed |
| **PERF-04** | Store pre-computed `word_count` column on `pages` table | `supabase/migrations/017_word_count.sql`, `transcribe/index.ts` | Performance | ✅ Completed |
| **BUG-01** | Fix page number collision on capture after deletion | `artifacts/margin/app/capture.tsx` | Bug Fix | ✅ Completed |
| **SEC-07** | Fix biometric auth race condition in journal reader | `artifacts/margin/app/journal/[id].tsx` | Security | ✅ Completed |
| **FEAT-01** | Searchable PDF Journal Export Engine | `artifacts/margin/lib/pdfExport.ts`, `profile.tsx` | Feature | ✅ Completed |
| **E4** | Verify Gemini API key & secrets in Supabase Vault | Supabase Dashboard / CLI | Operations | 🟡 Important |
| **D1** | Replace App Store review URL placeholder | `artifacts/margin/app/(tabs)/profile.tsx` | Release | ⏸ Blocked — needs Apple App ID |
| **FEAT-02** | Semantic Vector Search via `pgvector` | `supabase/migrations/018_pgvector_search.sql` | Feature | 💡 Roadmap |
| **D2** | iCloud Backup Integration | `artifacts/margin/app/(tabs)/profile.tsx` | Feature | ⏸ Deferred |
| **D3** | Google Drive Backup Integration | `artifacts/margin/lib/googleDrive.ts`, `profile.tsx` | Feature | ⏸ Deferred |
| **D4** | Home Screen Widget ("On This Day" / Streak) | `targets/widget` | Feature | ⏸ Deferred |

---

## Context & Architecture Standards

- **Key AsyncStorage Key:** `"margin:settings"` — stores user settings as a JSON object.
- **Preferences Interface:** Defined in [`artifacts/margin/app/(tabs)/profile.tsx`](file:///Users/songdavid93374/Projects/margin/artifacts/margin/app/(tabs)/profile.tsx) under the `Prefs` type. Any new preference must update `Prefs` type, `DEFAULT_PREFS`, `savePref()`, and the storage loader `useEffect`.
- **Supabase Client:** `import { supabase } from "@/lib/supabase"`.
- **UI & Styling Tokens:** `import { useColors } from "@/hooks/useColors"`.
- **TypeScript Rules:** Strict type definitions (`no implicit any`), explicit error handling, zero non-null assertions unless presence is guaranteed.

---

## Technical Specifications for Pending Tasks

### SEC-03. Prevent User Email Enumeration in Friend Lookup RPC

* **Target File:** `supabase/migrations/014_fix_email_search.sql`
* **Priority:** 🟡 Medium Priority (Security)

#### Problem
In `011_social.sql`, `find_user_by_email` runs as `SECURITY DEFINER` and returns user IDs and raw emails matching `lower(email) = lower(p_email)` without rate limiting or exact matching constraints.

#### Exact Implementation Specification
1. Create a migration file `supabase/migrations/014_fix_email_search.sql`.
2. Update `find_user_by_email` to require exact email string match and return only `user_id` and masked email (`u***@domain.com`):

```sql
-- Migration: 014_fix_email_search.sql
CREATE OR REPLACE FUNCTION public.find_user_by_email(p_email text)
RETURNS TABLE (user_id uuid, display_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_target_email text := lower(trim(p_email));
BEGIN
  -- Require caller authentication
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Require non-empty email
  IF v_target_email IS NULL OR length(v_target_email) < 3 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    u.id AS user_id,
    (regexp_replace(u.email, '^(.)[^@]+', '\1***') || '@' || split_part(u.email, '@', 2)) AS display_label
  FROM auth.users u
  WHERE lower(u.email) = v_target_email
    AND u.id <> v_caller_id
  LIMIT 1;
END;
$$;
```

---

### SEC-04. Fix Path Traversal Prefix Matching in Production Static Web Server

* **Target File:** [`artifacts/margin/server/serve.js`](file:///Users/songdavid93374/Projects/margin/artifacts/margin/server/serve.js#L96-L105)
* **Priority:** 🟡 Medium Priority (Security)

#### Problem
In `serve.js`, line 100 checks `filePath.startsWith(STATIC_ROOT)`. If `STATIC_ROOT` is `/var/www/static-build` without a trailing path separator, `.startsWith()` evaluates `true` for `/var/www/static-build-secrets/config.json`.

#### Exact Implementation Specification
In `artifacts/margin/server/serve.js`, update `serveStaticFile`:

```javascript
function serveStaticFile(urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(STATIC_ROOT, safePath);

  // Ensure trailing separator to avoid matching sibling directories starting with same prefix
  const rootWithSep = STATIC_ROOT.endsWith(path.sep) ? STATIC_ROOT : STATIC_ROOT + path.sep;
  if (!filePath.startsWith(rootWithSep) && filePath !== STATIC_ROOT) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "content-type": contentType });
  res.end(content);
}
```

---

### SEC-05. Sanitize Dev Login Credentials in Client Bundle

* **Target File:** [`artifacts/margin/app/index.tsx`](file:///Users/songdavid93374/Projects/margin/artifacts/margin/app/index.tsx#L659-L684)
* **Priority:** 🟢 Low Priority (Security Hygiene)

#### Problem
`EXPO_PUBLIC_DEV_EMAIL` and `EXPO_PUBLIC_DEV_PASSWORD` environment variables are compiled directly into the Expo JS bundle if present in `.env`.

#### Exact Implementation Specification
In `artifacts/margin/app/index.tsx`, update the quick-login section to check explicit `__DEV__` flag and require dev mode without embedding default strings in production builds:

```tsx
{__DEV__ && process.env.EXPO_PUBLIC_DEV_EMAIL && (
  <TouchableOpacity
    style={styles.devFillButton}
    onPress={() => {
      setEmail(process.env.EXPO_PUBLIC_DEV_EMAIL || "");
      setPassword(process.env.EXPO_PUBLIC_DEV_PASSWORD || "");
    }}
  >
    <Text style={styles.devFillText}>⚡ Dev Quick Fill</Text>
  </TouchableOpacity>
)}
```

---

### PERF-03. Add Partial Composite Database Indexes

* **Target File:** `supabase/migrations/015_performance_indexes.sql`
* **Priority:** 🟡 Medium Priority (Performance)

#### Problem
1. Queries fetching active journal pages filter by `journal_id` AND `deleted_at IS NULL` and sort by `page_number`. The table currently only has a single-column index on `pages(journal_id)`.
2. Social feed engagement checks perform `COUNT(DISTINCT feed_likes.id)` across all friends on every feed refresh.

#### Exact Implementation Specification
Create `supabase/migrations/015_performance_indexes.sql`:

```sql
-- Migration: 015_performance_indexes.sql

-- 1. Partial compound index for fast active page queries
CREATE INDEX IF NOT EXISTS pages_journal_active_idx
  ON public.pages (journal_id, page_number)
  WHERE deleted_at IS NULL;

-- 2. Compound index for feed likes lookup
CREATE INDEX IF NOT EXISTS feed_likes_entry_user_idx
  ON public.feed_likes (entry_id, user_id);

-- 3. Compound index for feed comments lookup
CREATE INDEX IF NOT EXISTS feed_comments_entry_created_idx
  ON public.feed_comments (entry_id, created_at DESC);
```

---

### PERF-04. Store Pre-Computed `word_count` Column on `pages` Table

* **Target Files:** 
  - `supabase/migrations/016_word_count.sql`
  - [`supabase/functions/transcribe/index.ts`](file:///Users/songdavid93374/Projects/margin/supabase/functions/transcribe/index.ts)
* **Priority:** 🟡 Medium Priority (Performance)

#### Problem
`get_user_stats()` calculates total user words by converting `transcription_text` to an array (`string_to_array(trim(p.transcription_text), ' ')`) across every page on every profile load.

#### Exact Implementation Specification

1. Create migration `supabase/migrations/016_word_count.sql`:

```sql
-- Migration: 016_word_count.sql
ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS word_count integer DEFAULT 0 NOT NULL;

-- Backfill word_count for existing pages
UPDATE public.pages
SET word_count = CASE 
  WHEN transcription_text IS NULL OR trim(transcription_text) = '' THEN 0
  ELSE array_length(string_to_array(trim(transcription_text), ' '), 1)
END;

-- Fast index for word count aggregation
CREATE INDEX IF NOT EXISTS pages_user_word_count_idx
  ON public.pages (user_id, word_count)
  WHERE deleted_at IS NULL;

-- Update get_user_stats to use pre-computed word_count column directly
CREATE OR REPLACE FUNCTION public.get_user_stats()
RETURNS TABLE (
  total_journals  bigint,
  total_pages     bigint,
  total_words     bigint,
  streak_days     integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM journals WHERE user_id = v_user_id AND deleted_at IS NULL) AS total_journals,
    (SELECT COUNT(*) FROM pages WHERE user_id = v_user_id AND deleted_at IS NULL) AS total_pages,
    (SELECT COALESCE(SUM(word_count), 0)::bigint FROM pages WHERE user_id = v_user_id AND deleted_at IS NULL) AS total_words,
    1 AS streak_days;
END;
$$;
```

2. In `supabase/functions/transcribe/index.ts`, compute `wordCount` during transcription save:

```typescript
const wordCount = transcriptionText.trim()
  ? transcriptionText.trim().split(/\s+/).length
  : 0;

await adminClient
  .from("pages")
  .update({
    transcription_text: transcriptionText,
    transcription_status: "done",
    pending_corrections: pendingCorrections,
    correction_count: pendingCorrections.length,
    word_count: wordCount,
  })
  .eq("id", page_id);
```

---

### E4. Verify Gemini API Key & Supabase Vault Secrets

* **Location:** Supabase Dashboard → Edge Functions → Secrets
* **Priority:** 🟡 Important (Operations)

#### Verification & Setup Procedure
1. Set active secrets via Supabase CLI:
   ```bash
   supabase secrets set GEMINI_API_KEY="AIzaSy..."
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY="eyJhbG..."
   ```
2. Verify secrets in Edge Functions via Deno runtime:
   - `Deno.env.get("GEMINI_API_KEY")`
   - `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`

---

### D1. Replace App Store Review URL Placeholder

* **Target File:** [`artifacts/margin/app/(tabs)/profile.tsx`](file:///Users/songdavid93374/Projects/margin/artifacts/margin/app/(tabs)/profile.tsx#L1196-L1200)
* **Status:** ⏸ Blocked (Awaiting App Store Connect App ID)

#### Exact Implementation Specification
Replace lines 1196–1200 in `profile.tsx` once Apple App ID is assigned:

```tsx
<Row
  icon="star"
  label="Rate Margin"
  onPress={() => {
    const appleAppId = "6740000000"; // Replace with real assigned ID
    const url = Platform.OS === "ios"
      ? `itms-apps://itunes.apple.com/app/id${appleAppId}?action=write-review`
      : `https://apps.apple.com/app/id${appleAppId}`;
    Linking.openURL(url).catch(() =>
      Alert.alert("Error", "Could not open the App Store.")
    );
  }}
/>
```

---

### FEAT-01. Searchable PDF Journal Export Engine

* **Target Files:**
  - `artifacts/margin/lib/pdfExport.ts` (NEW)
  - [`artifacts/margin/app/(tabs)/profile.tsx`](file:///Users/songdavid93374/Projects/margin/artifacts/margin/app/(tabs)/profile.tsx)
* **Priority:** 💡 Feature Roadmap

#### Exact Implementation Specification

1. Create `artifacts/margin/lib/pdfExport.ts`:

```typescript
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { supabase } from "./supabase";

export async function exportJournalToPdf(journalId: string, journalTitle: string): Promise<void> {
  const { data: pages, error } = await supabase
    .from("pages")
    .select("page_number, image_url, transcription_text")
    .eq("journal_id", journalId)
    .is("deleted_at", null)
    .order("page_number", { ascending: true });

  if (error || !pages || pages.length === 0) {
    throw new Error("No pages found to export.");
  }

  const pagesHtml = pages.map((p) => `
    <div style="page-break-after: always; padding: 20px; font-family: system-ui, sans-serif;">
      <h3 style="color: #666;">Page ${p.page_number}</h3>
      ${p.image_url ? `<img src="${p.image_url}" style="max-width: 100%; max-height: 400px; object-fit: contain; border-radius: 8px;" />` : ''}
      <div style="margin-top: 16px; padding: 12px; background: #faf7f2; border-radius: 8px; font-size: 14px; line-height: 1.5; white-space: pre-wrap;">
        ${p.transcription_text || '<em>No transcription available</em>'}
      </div>
    </div>
  `).join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${journalTitle}</title>
      </head>
      <body>
        <h1 style="text-align: center; margin-top: 40px; font-family: system-ui;">${journalTitle}</h1>
        <p style="text-align: center; color: #888;">Exported from Margin</p>
        <hr style="margin: 20px 0;" />
        ${pagesHtml}
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Export ${journalTitle}` });
}
```

2. Add "Export PDF" row in `profile.tsx` or journal detail reader.

---

### FEAT-02. Semantic Vector Search via `pgvector`

* **Target Files:**
  - `supabase/migrations/017_pgvector_search.sql`
  - [`supabase/functions/transcribe/index.ts`](file:///Users/songdavid93374/Projects/margin/supabase/functions/transcribe/index.ts)
* **Priority:** 💡 Feature Roadmap

#### Exact Implementation Specification

1. Create migration `supabase/migrations/017_pgvector_search.sql`:

```sql
-- Migration: 017_pgvector_search.sql
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS embedding extensions.vector(768);

-- Create HNSW vector index for cosine distance vector search
CREATE INDEX IF NOT EXISTS pages_embedding_hnsw_idx
  ON public.pages USING hnsw (embedding extensions.vector_cosine_ops)
  WHERE deleted_at IS NULL;

-- Vector search RPC function
CREATE OR REPLACE FUNCTION public.match_pages_semantic(
  query_embedding extensions.vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  journal_id uuid,
  page_number integer,
  transcription_text text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.journal_id,
    p.page_number,
    p.transcription_text,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM pages p
  WHERE p.user_id = auth.uid()
    AND p.deleted_at IS NULL
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
  ORDER BY p.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;
```

---

### D2, D3, D4. Deferred Features Quick Reference

* **D2 (iCloud Backup):** Enable `ios.supportsDocumentBrowser: true` in `app.json` and generate `margin_backup.zip` inside `FileSystem.documentDirectory`.
* **D3 (Google Drive Backup):** Implement `lib/googleDrive.ts` uploading encrypted backup JSON to Google Drive `appDataFolder` via OAuth token.
* **D4 (Home Screen Widget):** Expo Widget extension storing daily streak and "On This Day" entry memory in `AppGroup` shared container.

### FEAT-03. Add Unread Indicator (Red Dot) to Review Tab

* **Target Files:**
  - `artifacts/margin/app/(tabs)/_layout.tsx`
  - `artifacts/margin/app/(tabs)/review.tsx`
* **Priority:** 🟢 Low Priority (UI/UX)

#### Problem
Currently, users don't know if they have a page to review until they tap the "Review" tab. A subtle red dot should appear on the Review tab icon if `get_resurface_page` has a pending entry.

#### Exact Implementation Specification
1. In `artifacts/margin/app/(tabs)/review.tsx`, import `DeviceEventEmitter` from `react-native` and modify `fetchPage` to broadcast its result globally:
   ```tsx
   import { DeviceEventEmitter } from "react-native";

   // Inside ReviewScreen's fetchPage:
   const fetchPage = useCallback(async () => {
     try {
       const { data, error } = await supabase.rpc("get_resurface_page");
       if (error) throw error;
       const rows = data as ResurfacePage[] | null;
       if (rows && rows.length > 0) {
         setPage(rows[0]);
         DeviceEventEmitter.emit("review_queue_updated", true);
       } else {
         setPage(null);
         DeviceEventEmitter.emit("review_queue_updated", false);
       }
     } catch (err) {
       console.error("[Review] get_resurface_page error:", err);
       setPage(null);
     }
   }, []);
   ```

2. In `artifacts/margin/app/(tabs)/_layout.tsx`, add state to track if a review is available. Use a `useEffect` to fetch this on mount and on AppState changes (returning to foreground). Additionally, clear the indicator immediately if the user navigates to the Review tab:
   ```tsx
   import { AppState, AppStateStatus, DeviceEventEmitter } from "react-native";
   import { usePathname } from "expo-router";

   // ... inside TabLayout component:
   const [hasReview, setHasReview] = useState(false);
   const pathname = usePathname();

   const checkReview = useCallback(async () => {
     try {
       const { data } = await supabase.rpc("get_resurface_page");
       setHasReview(Array.isArray(data) && data.length > 0);
     } catch {
       setHasReview(false);
     }
   }, []);

   // Dismiss red dot if user focuses the Review tab
   useEffect(() => {
     if (pathname === "/review") {
       setHasReview(false);
     }
   }, [pathname]);

   useEffect(() => {
     // Don't show dot if they are already on the Review tab
     if (pathname !== "/review") {
       checkReview();
     }
     
     const appStateSub = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
       if (nextAppState === "active" && pathname !== "/review") checkReview();
     });
     
     const eventSub = DeviceEventEmitter.addListener("review_queue_updated", (hasItems: boolean) => {
       if (pathname !== "/review") setHasReview(hasItems);
     });

     return () => {
       appStateSub.remove();
       eventSub.remove();
     };
   }, [checkReview, pathname]);
   ```

3. Update the `Tabs.Screen` for `review` in `_layout.tsx` to render the red dot badge directly inside `tabBarIcon` for precise placement:
   ```tsx
   <Tabs.Screen
     name="review"
     options={{
       title: "Review",
       tabBarIcon: ({ color }) => (
         <View>
           <Feather name="star" size={20} color={color} />
           {hasReview && (
             <View
               style={{
                 position: "absolute",
                 top: -2,
                 right: -4,
                 width: 8,
                 height: 8,
                 borderRadius: 4,
                 backgroundColor: colors.destructive || "#ef4444",
                 borderWidth: 1.5,
                 borderColor: isIOS ? "transparent" : colors.background,
               }}
             />
           )}
         </View>
       ),
     }}
   />
   ```
