# Margin — Remaining Features

---

## IMMEDIATE — needs manual action

### Run the search migration in Supabase

`supabase/migrations/003_search.sql` has been written but not applied. Search returns nothing
until you run it.

**Go to:** Supabase Dashboard → SQL Editor → New query → paste `003_search.sql` → Run.

Also run `supabase functions deploy transcribe` to push the rate-limiting change live.

---

## 1. EAS Build config (required before any TestFlight / App Store submission)

**Problem:** There is no `eas.json`, no bundle identifier set, icons are missing at required sizes,
and the notification icon PNG referenced in `app.json` doesn't exist on disk yet. None of this
prevents development builds from running, but `eas build` will fail without it.

**Files to create/modify:**
- `artifacts/margin/eas.json` (new)
- `artifacts/margin/app.json`
- `artifacts/margin/assets/images/notification-icon.png` (new, design asset)

---

### Step 1 — Create eas.json

Create `artifacts/margin/eas.json`:

```json
{
  "cli": {
    "version": ">= 14.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "YOUR_APPLE_ID_EMAIL",
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "YOUR_APPLE_TEAM_ID"
      }
    }
  }
}
```

---

### Step 2 — Set bundle identifiers in app.json

In `app.json`, add `bundleIdentifier` under `ios` and `package` under `android`:

```json
"ios": {
  "supportsTablet": false,
  "bundleIdentifier": "com.yourname.margin",
  "infoPlist": { ... }
},
"android": {
  "package": "com.yourname.margin",
  "permissions": [ ... ]
}
```

Pick a reverse-DNS ID you own. Once submitted to Apple, this cannot be changed.

---

### Step 3 — Create the notification icon

Create `artifacts/margin/assets/images/notification-icon.png`:
- 96×96 px
- White icon on **transparent** background
- Android uses this as the small notification icon — it must be monochrome white
- iOS ignores this file and uses the app icon automatically
- A simplified version of the existing app icon works fine

---

### Step 4 — Verify app icon

`assets/images/icon.png` must be exactly **1024×1024 px**. EAS Build will reject it otherwise.
Check with: `sips -g pixelWidth -g pixelHeight assets/images/icon.png`

---

### Step 5 — Build and submit

```bash
cd artifacts/margin
eas build --platform ios --profile production
eas submit --platform ios
```

---

## 2. Storage used — real data

**Problem:** `StorageRow` in `profile.tsx` shows hardcoded `used = 2.4` and `total = 15`.
The user has no idea how much space their journals actually take.

**Why it's hard:** The Supabase client SDK has no built-in way to sum storage object sizes from
the client. `supabase.storage.from("journal_pages").list()` returns file metadata per folder,
not a flat aggregate. The only way to get a total is via the `storage.objects` system table,
which requires either the service role or a DB trigger.

**Recommended approach — DB trigger maintaining a running total:**

Run in Supabase SQL Editor:

```sql
-- Add storage tracking to a user stats table (create if needed)
CREATE TABLE IF NOT EXISTS user_stats (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_bytes bigint NOT NULL DEFAULT 0
);

ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_stats: select own" ON user_stats
  FOR SELECT USING (auth.uid() = user_id);

-- Trigger function: fires on every storage.objects INSERT or DELETE
CREATE OR REPLACE FUNCTION update_user_storage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  uid uuid;
  delta bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    uid := (NEW.owner)::uuid;
    delta := (NEW.metadata->>'size')::bigint;
  ELSE
    uid := (OLD.owner)::uuid;
    delta := -((OLD.metadata->>'size')::bigint);
  END IF;

  INSERT INTO user_stats (user_id, storage_bytes)
    VALUES (uid, GREATEST(0, delta))
  ON CONFLICT (user_id) DO UPDATE
    SET storage_bytes = GREATEST(0, user_stats.storage_bytes + delta);

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_storage_bytes
AFTER INSERT OR DELETE ON storage.objects
FOR EACH ROW EXECUTE FUNCTION update_user_storage();
```

**In profile.tsx, update StorageRow:**

```tsx
function StorageRow() {
  const colors = useColors();
  const [usedBytes, setUsedBytes] = useState<number | null>(null);
  const PLAN_GB = 15;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      supabase
        .from("user_stats")
        .select("storage_bytes")
        .eq("user_id", session.user.id)
        .single()
        .then(({ data }) => {
          setUsedBytes(data?.storage_bytes ?? 0);
        });
    });
  }, []);

  const usedGB = usedBytes !== null ? usedBytes / 1024 / 1024 / 1024 : null;
  const pct = usedGB !== null ? Math.min(usedGB / PLAN_GB, 1) : 0;
  const label = usedGB !== null ? `${usedGB.toFixed(2)} GB` : "…";
  // ... rest of existing JSX, replace used/total with usedGB/PLAN_GB
}
```

**Watch out for:** The trigger runs on `storage.objects` which is a system table. Supabase allows
triggers on it but the `owner` column is a string UUID, not typed — hence the `(NEW.owner)::uuid`
cast. Test with a real upload before relying on the numbers.

---

## 3. "On this day" — personalized notification

**Problem:** The current implementation schedules a generic daily local notification at 10:00 AM.
It will always say "You wrote something worth revisiting a year ago" whether or not you actually
wrote anything that day. A user with no entries from a year ago still gets the notification.

**What it needs to be:** A server-side job that runs once a day, checks each user's pages for
entries written exactly 365 days ago, and sends a personalized push notification containing the
actual first sentence of that page's transcription. Users with no matching entries get nothing.

**Implementation has three parts:**

---

### Part A — Store Expo push tokens

In `app/_layout.tsx`, after the session is established, register for push notifications and
store the token in a new `push_tokens` table:

```sql
-- Run in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS push_tokens (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  token   text NOT NULL,
  platform text NOT NULL, -- 'ios' | 'android'
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, token)
);
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_tokens: insert own"
  ON push_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_tokens: update own"
  ON push_tokens FOR UPDATE USING (auth.uid() = user_id);
```

In `_layout.tsx`, inside `RootLayout`, after `session` is set:

```tsx
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

useEffect(() => {
  if (!session) return;
  (async () => {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId,
    });
    await supabase.from("push_tokens").upsert({
      user_id: session.user.id,
      token: token.data,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,token" });
  })();
}, [session]);
```

You get the `projectId` from `eas.json` after running `eas build` once — it gets written to
`app.json` under `extra.eas.projectId` automatically.

---

### Part B — Create a daily Edge Function

Create `supabase/functions/daily-digest/index.ts`:

```ts
// Called by a pg_cron job daily at 09:50 UTC (fires before 10:00 local notifications)
// Requires: SUPABASE_SERVICE_ROLE_KEY and EXPO_ACCESS_TOKEN in Supabase secrets

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const expoToken = Deno.env.get("EXPO_ACCESS_TOKEN")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Find pages written between 364 and 366 days ago (±1 day buffer for timezones)
  const from = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString();
  const to   = new Date(Date.now() - 364 * 24 * 60 * 60 * 1000).toISOString();

  const { data: pages } = await admin
    .from("pages")
    .select("journal_id, transcription_text, journals!inner(user_id, title)")
    .gte("created_at", from)
    .lte("created_at", to)
    .not("transcription_text", "is", null)
    .is("deleted_at", null);

  if (!pages?.length) return new Response("no matches", { status: 200 });

  // Group by user — pick one page per user
  const byUser = new Map<string, { text: string; journalTitle: string }>();
  for (const p of pages) {
    const uid = (p.journals as { user_id: string; title: string }).user_id;
    if (!byUser.has(uid)) {
      byUser.set(uid, {
        text: p.transcription_text!.slice(0, 120),
        journalTitle: (p.journals as { title: string }).title,
      });
    }
  }

  // Fetch their push tokens
  const userIds = Array.from(byUser.keys());
  const { data: tokens } = await admin
    .from("push_tokens")
    .select("user_id, token")
    .in("user_id", userIds);

  if (!tokens?.length) return new Response("no tokens", { status: 200 });

  // Send via Expo Push API
  const messages = tokens.map(({ user_id, token }) => {
    const entry = byUser.get(user_id)!;
    return {
      to: token,
      title: "On this day",
      body: entry.text + (entry.text.length >= 120 ? "…" : ""),
      data: {},
    };
  });

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${expoToken}`,
    },
    body: JSON.stringify(messages),
  });

  return new Response(`sent ${messages.length}`, { status: 200 });
});
```

Deploy: `supabase functions deploy daily-digest`

---

### Part C — Schedule it with pg_cron

Run in Supabase SQL Editor:

```sql
SELECT cron.schedule(
  'daily-on-this-day',
  '50 9 * * *',   -- 09:50 UTC daily
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/daily-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

You'll need to set `app.supabase_url` and `app.service_role_key` as Postgres config parameters,
or hardcode the URL (less clean). pg_cron is available on Supabase Pro plan.

**Alternative to pg_cron:** Use a GitHub Actions cron workflow or an external cron service
(cron-job.org, Render cron jobs) to hit the Edge Function URL with a service-role Bearer token.
This works on any Supabase plan.

**Watch out for:** The ±1 day buffer for timezones means some users get the notification a day
early or late. A proper fix stores each user's timezone offset in their profile. For v1, the
buffer is acceptable.

---

## 4. iCloud backup

**Problem:** The `iCloudBackup` toggle saves to AsyncStorage but never touches iCloud.

**Reality check:** True iCloud sync (like Apple Notes) requires the `com.apple.developer.ubiquity-container-identifiers` entitlement and native CloudKit APIs — neither of which Expo exposes out of the box. This is a significant native integration.

**Practical v1 approach — "Save to iCloud Drive":**

Instead of automatic background sync, make the toggle trigger the same text export that
`handleExport` already does, but save to `FileSystem.documentDirectory` (which on iOS maps to
the app's Documents folder, which iCloud Drive can sync if the user has enabled "iCloud Drive →
Margin" in Settings).

This approach:
- Requires no new native modules
- Works within App Store rules
- The user manually enables iCloud sync for the app in iOS Settings

Update the `iCloudBackup` onChange in `profile.tsx`:

```tsx
onChange={async (v) => {
  if (v) {
    Alert.alert(
      "iCloud backup",
      "Margin will save a text export to your Documents folder. Enable iCloud Drive → Margin in iOS Settings to sync it to iCloud.",
      [{ text: "OK" }]
    );
    // Trigger an initial export to Documents
    await handleExport(); // already implemented
  }
  setICloudBackup(v);
  savePref({ iCloudBackup: v });
}}
```

**Watch out for:** This is not true real-time sync — it's a manual export to a folder that iCloud
Drive may pick up. If you want true automatic background sync, you'd need to use a third-party
library like `react-native-cloud-store` (wraps iCloud APIs natively) and add it as a bare
workflow plugin with a custom `app.plugin.js`. That's a significant scope increase.

---

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

## 6. Per-journal privacy

**Problem:** "Per-journal privacy" row in Privacy & Security has no `onPress` and no backing
concept in the data model. A user cannot lock individual journals.

**Data model change — run in Supabase SQL Editor:**

```sql
ALTER TABLE journals ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false;
CREATE INDEX IF NOT EXISTS journals_is_private_idx ON journals (user_id) WHERE is_private = true;
```

**Implementation plan:**

1. In `journal/[id].tsx`, when the journal loads, check `journal.is_private`. If true, immediately
   show a biometric prompt using `LocalAuthentication.authenticateAsync` before revealing any page
   content. Show a blank screen while the prompt is pending. If auth fails, `router.back()`.

2. In the journal reader header, add a lock icon button (beside the edit toggle) that calls:
   ```tsx
   await supabase.from("journals").update({ is_private: !journal.isPrivate }).eq("id", journalId);
   ```

3. In the library grid (`index.tsx`), journals where `is_private = true` should show a lock badge
   on the cover tile. You'll need to add `is_private` to the journals query.

4. Wire the "Per-journal privacy" row in `profile.tsx` to push to a screen that lists all journals
   with a toggle for each — or simplify: remove the row from profile entirely since the lock is
   managed per-journal inside the reader.

**Watch out for:** The library grid currently fetches journals with `select("id, title, cover_color,
cover_style, cover_image_url, created_at, page_count")`. Add `is_private` to that select. If you
forget, the badge won't render and the auth gate won't know to fire.

---

## 7. Page reordering

**Problem:** Pages are ordered by `page_number` set at insert time. Once captured, there's no way
to change the order. If you photograph pages out of sequence, they stay in capture order forever.

**Data model:** `page_number` is an integer. Reordering means updating multiple rows' `page_number`
values atomically.

**Install:**

```bash
cd artifacts/margin
npx expo install react-native-draggable-flatlist
```

**Implementation:**

In `journal/[id].tsx`, add a "Reorder" mode alongside the existing `editMode`. When reorder mode
is active, swap the regular `FlatList` for `DraggableFlatList` from the package above:

```tsx
import DraggableFlatList, { RenderItemParams } from "react-native-draggable-flatlist";

// In the header: a "Reorder" button that sets reorderMode = true
// When reorderMode is active:
<DraggableFlatList
  data={pages}
  keyExtractor={(item) => item.id}
  renderItem={({ item, drag, isActive }: RenderItemParams<JournalPage>) => (
    <TouchableOpacity onLongPress={drag} style={isActive ? styles.dragging : undefined}>
      {/* simplified page thumbnail — not the full PageItem */}
    </TouchableOpacity>
  )}
  onDragEnd={({ data: reordered }) => {
    setPages(reordered);
    // Persist new order
    const updates = reordered.map((p, i) => ({ id: p.id, page_number: i + 1 }));
    // Supabase has no bulk update — do it in a transaction via RPC
    supabase.rpc("reorder_pages", { updates: JSON.stringify(updates) });
  }}
/>
```

**You need a new RPC for atomic reorder — run in Supabase SQL Editor:**

```sql
CREATE OR REPLACE FUNCTION reorder_pages(updates jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(updates)
  LOOP
    UPDATE pages
    SET page_number = (item->>'page_number')::int
    WHERE id = (item->>'id')::uuid
      AND journal_id IN (
        SELECT id FROM journals WHERE user_id = auth.uid()
      );
  END LOOP;
END;
$$;
```

**Watch out for:** `DraggableFlatList` and the regular `FlatList` use different scroll mechanics.
Swapping between them based on `reorderMode` will cause a jarring re-mount. A cleaner approach
is a separate "Reorder" sheet — a modal that shows a draggable list of page thumbnails and saves
on dismiss. This keeps the reader's scroll behavior untouched.

---

## 8. Batch capture per-page transcription progress

**Problem:** When you capture multiple pages in one session, the capture screen shows a single
spinner for the whole batch. After navigating to the journal, some pages show "Transcribing…"
and others are done — but there's no way to see which pages are still pending at a glance from
the library or journal header.

**What's already working:** The Realtime subscription in `journal/[id].tsx` now updates individual
pages as they finish. The `PageItem` component already renders a spinner when
`transcriptionStatus === "pending" || "processing"`.

**What's missing:** The journal cover tile in the library grid has no indication that transcription
is in progress. A user who leaves the app and comes back sees their journal with no cue that
some pages are still processing.

**Implementation:**

1. Add `pending_count` to the journals query in `index.tsx`. You'll need a computed column or
   a separate query. Easiest: add a DB view or a computed field via RPC.

   Alternatively, just add `transcription_status` to the pages subquery in the journals list:

   ```sql
   -- A lightweight RPC that returns pending page count per journal
   CREATE OR REPLACE FUNCTION journal_pending_counts(uid uuid)
   RETURNS TABLE (journal_id uuid, pending_count bigint)
   LANGUAGE sql SECURITY DEFINER AS $$
     SELECT p.journal_id, count(*) AS pending_count
     FROM pages p
     JOIN journals j ON j.id = p.journal_id
     WHERE j.user_id = uid
       AND p.transcription_status IN ('pending', 'processing')
       AND p.deleted_at IS NULL
     GROUP BY p.journal_id;
   $$;
   ```

2. In `index.tsx`, after fetching journals, call this RPC and merge the result onto each journal
   item. Show a small pulsing indicator on journal covers where `pending_count > 0`.

3. Wire a Realtime subscription in `index.tsx` on `pages` table UPDATE events filtered to this
   user's journals — decrement the pending count for the affected journal when status changes to
   "done" or "failed".
