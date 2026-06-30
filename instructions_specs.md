# Margin — Implementation Specs

This document describes every major implementation task needed to turn the current frontend prototype into a working application. Each section covers what the feature does, why it exists, how to build it, what to watch for, what must be verified before moving on, and a recommended step-by-step workflow. Sections are ordered by dependency — later sections assume earlier ones are complete.

---

## Critical design decisions

These three decisions were made by auditing the existing frontend before any backend work began. They have direct consequences on the schema, the correction flow, and the tab structure. Read this section before touching any code.

### 1. The Review tab is not a correction queue — it is a memory feature

The Review tab at `app/(tabs)/review.tsx` currently shows the placeholder text "Resurface past entries and rediscover your memories." That description is intentional and correct. This tab is a **Readwise-style spaced repetition feature** — it surfaces old pages the user may have forgotten, one at a time, on demand. It is not a queue for fixing bad transcriptions.

The transcription correction UI already exists in a better place: inside the journal reader, as the `reviewCount` badge on individual pages. Tapping the badge opens a correction flow. This is the right placement because corrections are contextual — the user is already reading that page.

**Consequence:** Do not build a second correction concept. The Review tab is Phase 3. The correction badge in the reader is Phase 2. Keep them separate and do not conflate them.

### 2. The segment model is not reflected in the UI — use the simple path

Some documentation refers to a `segments` model (text + confidence score + review_status per word). The actual frontend stores pages as a single flat `text` string with a `reviewCount: number`. These two models are incompatible and the frontend wins.

There are two implementation paths:

- **Simple path (Phase 2, recommended):** Store corrections as an array of `{original, corrected}` pairs in a `pending_corrections` JSONB column on the `pages` table. The UI only needs to know *how many* corrections exist — the badge already shows this. The glossary is built from the correction pairs. No segment-level rendering is required.
- **Complex path (do not build yet):** Render each word in the transcription as an individually tappable span, colored by confidence. This requires a custom text renderer — wrapping every word in a `<Text>` inside a `flexWrap: 'wrap'` `<View>` — and is both fragile and significant work. Do not build this until Phase 0 testing reveals that users genuinely cannot locate the flagged words without inline highlights.

**Consequence:** The schema in Section 3 uses `pending_corrections jsonb` on `pages`, not a separate `segments` table. The correction flow in Section 7 works through this array in a bottom sheet.

### 3. The camera capture screen does not exist and must be designed before it is built

The entire app's data pipeline depends on photographing journal pages, but there is no capture screen anywhere in the codebase. The only existing entry points are the "New journal" tile in the library and a camera FAB inside the reader's edit mode — both are tappable stubs that `console.log` and do nothing.

There is no designed flow for: live viewfinder, alignment guide, deskew, blur check, retake confirmation, or upload progress. Before writing any code for Section 4, this screen must be designed (see the Replit mockup prompt) and the design must be chosen. Building the capture flow against an unreviewed design wastes time.

**Consequence:** Section 4 (Camera capture screen) cannot be started until the UI design for Screen A is chosen from the mockup variants. Do not skip this step.

---

## 1. Replace the custom backend with Supabase

### What and why
The existing `artifacts/api-server` is a Fastify skeleton with one health-check route and no database schema. Rather than build auth, file storage, and a Postgres connection from scratch, migrate entirely to Supabase. Supabase provides a managed Postgres database, file storage with signed URLs, and a full auth system including Google and Apple OAuth — all of which the frontend already anticipates. The Fastify server and `lib/db` Drizzle setup should be retired; all data access moves to the Supabase JS client. This is the right moment because the custom server has near-zero sunk cost.

### Things to watch out for
- **Two Supabase clients exist and they are not the same thing.** The anon client (initialized with the public anon key) is what the mobile app uses. The service-role client (initialized with the secret service-role key) bypasses all RLS and is only for server-side code like Edge Functions. Never put the service-role key in the mobile app — it gives unrestricted database access. Confusing these two is the most common Supabase mistake.
- **The anon key is safe to ship in the app bundle**, but only because RLS protects the data. If you skip RLS, the anon key becomes dangerous. RLS must be enabled before any real data enters the database.
- **Expo environment variables have a non-obvious pattern.** In Expo, environment variables must be prefixed with `EXPO_PUBLIC_` to be accessible in the JS bundle via `process.env.EXPO_PUBLIC_*`. They are baked in at build time, not at runtime. Use `app.config.js` (not `app.json`) when you need to read from `.env` files dynamically, since `app.json` is static.
- **The existing `lib/db` and `artifacts/api-server` packages will rot if left in place.** Delete them or clearly mark them as deprecated so no future collaborator accidentally wires new features into dead code.

### Must be done
- Supabase project created, region chosen close to expected users (US East is the safest default).
- `@supabase/supabase-js` installed in `artifacts/margin`.
- A `lib/supabase.ts` singleton created in the Expo app that initializes and exports the client once. Every screen imports from this file, never initializes its own client.
- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in a `.env` file at the repo root, `.env` in `.gitignore`.
- RLS enabled globally on the Supabase project (dashboard → Authentication → Policies → enable RLS).
- `artifacts/api-server` and `lib/db` removed from the monorepo or clearly deprecated with a README note.

### Double-check before moving on
- [ ] `supabase.from('journals').select('id').limit(1)` returns data (not an error) from a logged-in session in the Expo app.
- [ ] The anon key is in `.env`, not hardcoded in any source file.
- [ ] The service-role key appears nowhere in the `artifacts/margin` package — only in `.env` files used by Edge Functions or local scripts.
- [ ] `pnpm run typecheck` passes with the new dependency added.

### Step-by-step workflow
1. Create a new project at supabase.com. Pick a strong database password and save it to a password manager immediately.
2. From the Supabase dashboard → Settings → API, copy the Project URL and anon (public) key.
3. Create `.env` at the repo root. Add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Add `.env` to `.gitignore` if not already there.
4. `pnpm add @supabase/supabase-js` inside `artifacts/margin`.
5. Create `artifacts/margin/lib/supabase.ts`. Initialize the client using `createClient(url, key)` with the env vars. Export the instance.
6. Delete `artifacts/api-server` and `lib/db` source files. Update `pnpm-workspace.yaml` to remove them. Run `pnpm install` to confirm the workspace builds cleanly.
7. Verify `pnpm run typecheck` passes.
8. Commit: "Replace custom backend with Supabase client."

---

## 2. Wire auth to Supabase

### What and why
The auth screen at `app/index.tsx` is fully designed — email/password fields, Google and Apple social buttons, login/signup toggle, error states, loading spinner. It currently fakes a successful login with a `setTimeout` and navigates to `/(tabs)`. This section replaces that mock with real Supabase auth and adds a session guard so the app routes correctly for authenticated vs unauthenticated users.

### Things to watch out for
- **The session listener must be set up in the root layout, not in the auth screen.** If you put `onAuthStateChange` inside `app/index.tsx`, it gets torn down when the user navigates away from that screen, which means session expiry won't be caught. It belongs in `app/_layout.tsx` where it persists for the app's lifetime.
- **`signInWithOAuth` on mobile does not open a browser popup.** It requires `expo-web-browser` and `expo-linking` to handle the redirect URI correctly. The flow is: call `signInWithOAuth` → it returns a URL → open it with `WebBrowser.openAuthSessionAsync` → Supabase redirects to your app's deep link → catch it with `expo-linking` → call `setSession` with the tokens from the URL fragment. This is 30+ lines of boilerplate that is easy to get wrong.
- **Deep linking must be configured in `app.json`** under `scheme`. Without it, the OAuth redirect URL has nowhere to land on the device.
- **Session persistence on React Native requires `AsyncStorage`.** Pass `AsyncStorage` from `@react-native-async-storage/async-storage` as the `storage` option when initializing the Supabase client. Without it, the user is logged out every time the app cold-starts.
- **The "Skip login (dev only)" button bypasses auth entirely** and navigates straight to tabs. This is fine during development but must be removed — not commented out, removed — before TestFlight or any public distribution.
- **Email confirmation is enabled by default in Supabase.** New signups receive a confirmation email and cannot log in until they click it. Either disable this in the Supabase dashboard (Authentication → Settings → Email confirmation) for development, or implement a "check your email" state in the signup flow.

### Must be done
- `@react-native-async-storage/async-storage` installed and passed to the Supabase client constructor.
- `expo-web-browser` and `expo-linking` installed for OAuth.
- OAuth deep link scheme configured in `app.json`.
- `app/_layout.tsx` subscribes to `supabase.auth.onAuthStateChange` and drives navigation state (authenticated → tabs, unauthenticated → auth screen).
- Google OAuth configured in the Supabase dashboard (Authentication → Providers → Google) with the correct redirect URI.
- The "Skip login" button is behind a `__DEV__` guard at minimum: `{__DEV__ && <SkipButton />}`.

### Double-check before moving on
- [ ] Create a new account with email/password → user appears in Supabase dashboard → Authentication → Users.
- [ ] Log out and log back in → session is restored from AsyncStorage without re-entering credentials.
- [ ] Kill the app completely and reopen → still logged in (proves AsyncStorage persistence).
- [ ] Google OAuth redirect returns to the app correctly on both iOS simulator and Android emulator.
- [ ] Submitting the login form with wrong credentials shows the error message, not a crash.
- [ ] The "Skip login" button is not visible in a production build (`npx expo build` or `eas build`).

### Step-by-step workflow
1. `pnpm add @react-native-async-storage/async-storage expo-web-browser expo-linking` inside `artifacts/margin`.
2. Update `lib/supabase.ts` to pass `{ storage: AsyncStorage, detectSessionInUrl: false }` to `createClient`.
3. Add `"scheme": "margin"` to `app.json` (or `app.config.js`). This enables deep linking.
4. In the Supabase dashboard, add `margin://` as an allowed redirect URL under Authentication → URL Configuration.
5. Rewrite `app/_layout.tsx` to: check for an existing session on mount (`supabase.auth.getSession()`), subscribe to `onAuthStateChange`, and keep a `session` state that controls whether the root navigator renders the auth screen or the tabs.
6. In `app/index.tsx`, replace the `setTimeout` mock in `handleSubmit` with the real Supabase calls. Map Supabase error codes to the existing error state fields.
7. Implement the Google OAuth flow using `WebBrowser.openAuthSessionAsync`. Test on a real device or simulator — the OAuth redirect does not work in Expo Go's embedded browser on some versions.
8. Set up Google OAuth in the Supabase dashboard. You need a Google Cloud project with OAuth credentials. The authorized redirect URI is `https://<your-project-ref>.supabase.co/auth/v1/callback`.
9. Test the full round-trip: open app → redirected to auth → sign in with Google → redirected back → lands on tabs → kill app → reopen → still on tabs.
10. Wrap the "Skip login" button in `{__DEV__ && ...}`.
11. Commit: "Wire auth screen to Supabase with session persistence and Google OAuth."

---

## 3. Define the database schema

### What and why
The Supabase Postgres instance needs four tables that match the data shapes the frontend already uses: `journals`, `pages`, `corrections`, and `glossary`. These must be created with correct types, foreign keys, RLS policies, and indexes before any data-writing code is written. Getting the schema right here prevents painful migrations later.

### Things to watch out for
- **Use `uuid_generate_v4()` for primary keys, not serial integers.** UUIDs are safe to generate on the client before the row is inserted, which enables optimistic UI updates. Serial integers require a round-trip to get the new ID. Supabase has the `uuid-ossp` extension enabled by default.
- **`timestamptz` not `timestamp`.** Always store timestamps with timezone. `timestamp` stores no timezone and will cause silent bugs when users are in different zones or when daylight saving shifts.
- **Foreign keys must have `on delete cascade` for child tables.** If a journal is deleted, its pages should be deleted automatically. If a page is deleted, its corrections should be deleted. Without cascade, deletes will fail with a foreign key violation.
- **The `pages.page_number` field must be unique per journal**, not globally. Add a `unique(journal_id, page_number)` constraint. Without it, two pages can have the same number in the same journal, causing rendering bugs in the reader's horizontal scroll.
- **RLS on child tables requires joining to the parent.** You cannot simply write `user_id = auth.uid()` on `pages` because `pages` has no `user_id` column — it has `journal_id`. The policy must be: `exists (select 1 from journals where journals.id = pages.journal_id and journals.user_id = auth.uid())`. This is slower than a direct column check, so add an index on `journals.user_id`.
- **The `glossary` table needs a unique constraint** on `(user_id, original_word)` to make upserts work cleanly. Without it, you can accumulate multiple rows for the same misspelling.
- **Do not use the Supabase dashboard SQL editor for production schema changes.** Use SQL migration files stored in `supabase/migrations/` and applied via the Supabase CLI. This gives you version control and repeatable deployments. For this early stage, dashboard is acceptable for initial setup, but migrate to files before any collaborator joins.

### Must be done
- All four tables created with correct column types, foreign keys, cascade deletes, and unique constraints.
- RLS enabled on every table with policies for `select`, `insert`, `update`, `delete`.
- Indexes on: `journals.user_id`, `pages.journal_id`, `corrections.page_id`, `glossary(user_id, original_word)`.
- A `pages.transcription_status` column (`text`, values: `'pending' | 'processing' | 'done' | 'failed'`) added now — it will be needed in Section 5 and is painful to add later.
- TypeScript types generated from the schema using `supabase gen types typescript` and saved to `artifacts/margin/lib/database.types.ts`. Every Supabase query in the app should use these types.

### Double-check before moving on
- [ ] Insert a journal row in the SQL editor — confirm it succeeds.
- [ ] Attempt to insert a `pages` row referencing a non-existent `journal_id` — confirm it fails with a foreign key error.
- [ ] Delete the journal row — confirm the page row is also deleted (cascade).
- [ ] Attempt to insert a second glossary row with the same `(user_id, original_word)` — confirm it fails with a unique violation (proving upsert will work).
- [ ] Log in as User A in the app. Try to query User B's journal ID directly via `supabase.from('journals').select()` — confirm zero rows are returned (RLS working).
- [ ] Run `supabase gen types typescript` and confirm `database.types.ts` was generated without errors.

### Step-by-step workflow
1. Open Supabase dashboard → SQL Editor. Run the following in order:
   ```sql
   -- Enable UUID extension (likely already on)
   create extension if not exists "uuid-ossp";

   create table journals (
     id uuid primary key default uuid_generate_v4(),
     user_id uuid references auth.users on delete cascade not null,
     title text not null,
     cover_style text not null check (cover_style in ('solid', 'image')),
     cover_color text,
     cover_image_url text,
     created_at timestamptz default now() not null
   );

   create table pages (
     id uuid primary key default uuid_generate_v4(),
     journal_id uuid references journals on delete cascade not null,
     page_number integer not null,
     image_url text not null,
     transcription_text text,
     transcription_status text not null default 'pending'
       check (transcription_status in ('pending', 'processing', 'done', 'failed')),
     correction_count integer not null default 0,
     created_at timestamptz default now() not null,
     unique (journal_id, page_number)
   );

   create table corrections (
     id uuid primary key default uuid_generate_v4(),
     page_id uuid references pages on delete cascade not null,
     original_word text not null,
     corrected_word text not null,
     created_at timestamptz default now() not null
   );

   create table glossary (
     id uuid primary key default uuid_generate_v4(),
     user_id uuid references auth.users on delete cascade not null,
     original_word text not null,
     corrected_word text not null,
     updated_at timestamptz default now() not null,
     unique (user_id, original_word)
   );
   ```
2. Add indexes:
   ```sql
   create index on journals (user_id);
   create index on pages (journal_id);
   create index on corrections (page_id);
   ```
3. Enable RLS and add policies (repeat for each table with appropriate `exists` joins for child tables).
4. Install Supabase CLI locally (`brew install supabase/tap/supabase`). Run `supabase gen types typescript --project-id <ref> > artifacts/margin/lib/database.types.ts`.
5. Commit the generated types file and note in the README that it must be regenerated after any schema change.

---

## 4. Camera capture screen

> **Before starting this section:** Per Design Decision 3 above, the UI design for this screen must be finalized from the mockup variants before any code is written. The screen has no existing design — not even a wireframe. Choose Screen A from the Replit output first.

### What and why
This is the most critical missing screen in the entire codebase. No journal page data can enter the system without it. The only existing entry points — the "New journal" tile in the library and the camera FAB in the reader — are stub buttons that `console.log` and go nowhere. There is no designed capture flow: no live viewfinder, no alignment guide, no blur check, no retake state. It is triggered from two touch points: the "New journal" tile (first-time path, arrives with a freshly created `journal_id`) and the camera FAB in the reader's edit mode (add-a-page path, arrives with an existing `journal_id`). The screen photographs a physical journal page, previews it, runs a basic quality check, uploads it, and kicks off transcription.

### Things to watch out for
- **Camera permissions behave differently on iOS and Android, and in Expo Go vs a standalone build.** On iOS, the first permission request is permanent — if the user denies it, they must go to Settings manually. Always explain why the permission is needed before requesting it (a brief "Margin needs camera access to photograph your pages" screen or alert). Use `useCameraPermissions` from `expo-camera` v14+ (not the older `Camera.requestCameraPermissionsAsync` pattern, which is deprecated).
- **`expo-camera` and `expo-image-picker` serve different use cases.** Use `expo-camera` when you need a custom viewfinder UI (alignment overlays, live preview, custom capture button). Use `expo-image-picker` when you want the system camera UI — faster to build, less control. For Margin, the alignment guide overlay requires `expo-camera`.
- **Image files from the camera are large** — typically 3–8 MB on modern phones. Upload them as-is but also create a compressed thumbnail (`expo-image-manipulator` at 30% quality, max 800px wide) for use in the library cover. Store both URLs on the page row. Never render the full-resolution image in a list.
- **The upload must happen before navigation away from the camera screen**, but the transcription call does not. The sequence is: capture → quality check (local) → upload to Supabase Storage (wait for completion) → create `pages` row with `transcription_status: 'pending'` → navigate to reader → call Edge Function in background. If you navigate before the upload completes and the user force-quits the app, the page row is orphaned.
- **Supabase Storage paths must be unique.** Use `{user_id}/{journal_id}/{uuid}.jpg` — never `{journal_id}/{page_number}.jpg`, because if a page is deleted and re-added with the same number, the old file gets overwritten silently.
- **The quality check is purely heuristic.** Blur detection via Laplacian variance and brightness via average pixel luminance can be computed in JS using `expo-image-manipulator` to get pixel data. This is imprecise — treat it as a soft warning, never a hard block. Some journals have dark paper; some pages are intentionally faint.
- **The camera screen must handle the case where the user arrives from the journal creation flow (no existing journal ID) vs from the reader (journal ID is known).** Pass the `journal_id` as a route param. If it is missing, the screen was reached incorrectly — handle it defensively.

### Must be done
- `expo-camera` and `expo-image-manipulator` installed.
- Camera permission requested with an explanation before the system dialog.
- Alignment guide overlay rendered on the live viewfinder.
- Post-capture preview state with Retake and "Use this photo" buttons.
- Soft quality warning (blur/darkness) shown as a non-blocking banner, not an alert.
- Image compressed and uploaded to Supabase Storage before navigation.
- `pages` row created with `transcription_status: 'pending'` immediately after upload.
- Edge Function called in the background after navigation (fire-and-forget with error logging).

### Double-check before moving on
- [ ] Denying camera permission shows a graceful message, not a crash.
- [ ] Capturing a photo and tapping "Use this photo" navigates to the reader with the new page visible.
- [ ] The uploaded file appears in Supabase Storage dashboard under the correct path.
- [ ] The `pages` row exists in the database with `transcription_status: 'pending'` immediately after upload.
- [ ] Killing the app mid-upload (after the page row is created) does not leave a `pending` row that never resolves — the Edge Function must handle the case where it is called for an already-failed page.
- [ ] The reader shows a loading/pending state for the transcription while it processes.

### Step-by-step workflow
1. `pnpm add expo-camera expo-image-manipulator` inside `artifacts/margin`.
2. Add camera and media library permissions to `app.json` under `expo.ios.infoPlist` and `expo.android.permissions`.
3. Create `app/capture.tsx` as a full-screen modal route. Add it to `app/_layout.tsx` as a modal presentation.
4. Build the viewfinder state: render `<CameraView>` full-screen, overlay an alignment rectangle in the center third of the screen.
5. On capture (shutter button press), call `cameraRef.current.takePictureAsync({ quality: 0.9 })`. Store the result URI in local state and switch to preview mode.
6. In preview mode, show the captured image full-screen with Retake and "Use this photo" buttons.
7. On "Use this photo": run the quality check heuristic (compress to 200px, calculate average brightness). If below threshold, show the banner. Regardless, proceed on user confirmation.
8. Upload the full-resolution image to Supabase Storage. Show a progress indicator. Do not allow the user to navigate away during upload (disable the button, show spinner).
9. On upload success, insert the `pages` row. Navigate to the reader.
10. After navigation (use a `useEffect` cleanup or a background task), call the Edge Function with the page ID.
11. Commit: "Add camera capture screen with upload and transcription trigger."

---

## 5. Transcription Edge Function (Gemini)

### What and why
The Gemini API key must never appear in the mobile app bundle — it would be extractable from any downloaded binary. All transcription calls route through a Supabase Edge Function that holds the key as a secret, verifies the user's identity, downloads the image from storage, injects the user's glossary into the prompt, calls Gemini, and writes the result back to the database.

### Things to watch out for
- **Edge Functions run on Deno, not Node.js.** The `require()` syntax does not work. Use ES module imports. The Supabase JS client works in Deno but must be imported from `esm.sh` or the Deno-compatible CDN: `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'`. The Google Generative AI SDK may not have a Deno-compatible build — use the Gemini REST API directly via `fetch` instead.
- **The function must verify the caller's JWT before doing anything.** Extract the `Authorization: Bearer <token>` header, call `supabase.auth.getUser(token)` with a Supabase client initialized with the anon key, and reject the request if the user is not authenticated. Never trust the `user_id` field sent in the request body — derive it from the verified token.
- **Downloading from Supabase Storage inside an Edge Function requires the service-role key**, because the storage bucket should be private (not public). The service-role key bypasses RLS. Initialize a second Supabase client inside the function with the service-role key exclusively for the storage download. The service-role key is set via `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...` and accessed as `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.
- **Gemini's multimodal input requires the image as a base64-encoded string** in the request body, not a URL. Download the image bytes from storage, convert to base64 (`btoa(String.fromCharCode(...bytes))`), and pass it as an `inline_data` part with `mime_type: 'image/jpeg'`.
- **Edge Function timeouts are 60 seconds by default.** A Gemini call on a complex handwritten page can take 10–20 seconds. The upload + Gemini call + database write should comfortably fit, but do not add unnecessary awaits in series.
- **The function must update `transcription_status` to `'processing'` at the start and `'done'` or `'failed'` at the end.** If the function crashes mid-execution, the status stays `'processing'` forever. Add a timeout mechanism in the mobile client: if a page has been in `'processing'` for more than 2 minutes, show a "Transcription timed out — tap to retry" state.
- **Glossary injection must be capped.** If a user has 500 glossary entries, sending all of them in the prompt wastes tokens and may confuse the model. Cap at the 50 most recently updated entries.

### Must be done
- Function created at `supabase/functions/transcribe/index.ts`.
- JWT verification as the first step — reject unauthenticated requests with 401.
- `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` set as Supabase secrets, never in code.
- Glossary queried and injected into the system prompt (capped at 50 entries).
- `transcription_status` updated to `'processing'` on start, `'done'` or `'failed'` on completion.
- `correction_count` initialized to `0` on success (no corrections pending yet on a fresh transcription).
- Errors logged with enough detail to diagnose (Gemini error code, page ID, user ID).

### Double-check before moving on
- [ ] Call the function from `curl` with no Authorization header — confirm 401 is returned.
- [ ] Call the function with a valid JWT but a `page_id` belonging to a different user — confirm it returns 403 (the service-role client fetching the page must check ownership).
- [ ] Submit a clear, well-lit journal page photo — confirm the transcription text returned is accurate.
- [ ] Simulate a Gemini API error (wrong key) — confirm the page row is updated with `transcription_status: 'failed'`.
- [ ] Check Supabase Function logs for any unhandled promise rejections.
- [ ] Confirm the Gemini key does not appear anywhere in the deployed function bundle (`supabase functions download transcribe` and grep).

### Step-by-step workflow
1. Install Supabase CLI. Run `supabase functions new transcribe`. This creates `supabase/functions/transcribe/index.ts`.
2. Set secrets: `supabase secrets set GEMINI_API_KEY=<key> SUPABASE_SERVICE_ROLE_KEY=<key>`.
3. Write the function body:
   - Parse the Authorization header. Initialize the anon-key Supabase client. Call `getUser(token)`. Return 401 if null.
   - Parse the request body: `{ page_id, storage_path }`.
   - Update `pages` row: set `transcription_status = 'processing'`.
   - Initialize the service-role Supabase client. Download the image: `supabase.storage.from('pages').download(storage_path)`. Convert to base64.
   - Query the `glossary` table for the verified user's entries, ordered by `updated_at desc`, limit 50. Build the hint string.
   - Build the Gemini REST request. POST to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`. Include the base64 image and the system instructions with the glossary hint.
   - On success, update `pages` row: set `transcription_text`, `transcription_status = 'done'`, `correction_count = 0`.
   - On any error, update `pages` row: set `transcription_status = 'failed'`. Log the error. Return 500.
4. Test locally with `supabase functions serve transcribe` and a `curl` command.
5. Deploy: `supabase functions deploy transcribe`.
6. In `artifacts/margin`, update the camera capture screen to call the function after navigation using `supabase.functions.invoke('transcribe', { body: { page_id, storage_path } })`.
7. Commit: "Add transcription Edge Function with JWT auth, glossary injection, and status tracking."

---

## 6. Journal creation flow

### What and why
When the user taps "New journal," they need a screen to name the journal and pick a cover before any pages are added. This is a lightweight two-step modal: title input, then cover picker. On confirm, the journal row is created in the database and the user is taken immediately to the camera capture screen to add their first page.

### Things to watch out for
- **The cover image path (when user picks a photo) must be uploaded to Supabase Storage** before the journal row is inserted — you need the resulting URL to store. Upload to `{user_id}/covers/{uuid}.jpg`. This is a separate storage bucket from page images and should be configured separately.
- **The "Create journal" button must be disabled during the Supabase insert** to prevent double-taps creating duplicate journals. This is a simple `isSubmitting` state flag.
- **Title validation must happen on submit, not in real-time.** Real-time validation on a title field is annoying UX. Validate on button press: non-empty, max 60 characters.
- **The cover color picker's selected state must be visually unambiguous.** The existing app palette has warm colors that are close to each other in hue. Use a checkmark overlay or a thick border (3px), not just a subtle shadow, to indicate which swatch is selected.
- **The journal ID must be generated on the client (via `crypto.randomUUID()`)** before the insert, and passed as a route param to the capture screen. This allows the capture screen to construct the storage path for the first page (`{user_id}/{journal_id}/{page_uuid}.jpg`) without needing a round-trip to get the database-assigned ID. This is the reason for using UUID primary keys (Section 3).
- **The library screen must re-fetch after a new journal is created.** If you use a simple `useState` array, add the new journal to the array optimistically. If you use React Query or Supabase's `useQuery`, invalidate the `journals` cache. Do not rely on the user manually pulling to refresh.

### Must be done
- A `app/journal/new.tsx` screen (modal presentation) with title input and cover picker.
- Cover picker includes 6–8 predefined solid colors and a "choose photo" option.
- Journal row inserted into `journals` table with the Supabase client on confirm.
- Journal ID generated on the client before insert.
- On success, navigate to `app/capture.tsx` with `journal_id` as a param.
- Library screen updated to fetch live data from Supabase (replaces `MOCK_JOURNALS`).

### Double-check before moving on
- [ ] Create a journal → it appears in the Supabase dashboard `journals` table with the correct `user_id`.
- [ ] Create a journal → it appears in the library screen immediately without a manual refresh.
- [ ] Tap "Create journal" twice quickly → only one journal is created (double-tap protection).
- [ ] Try to create a journal with an empty title → button is disabled or error is shown.
- [ ] Select a photo as a cover → photo is uploaded to the `covers` bucket and the URL is saved to the journal row.
- [ ] Delete the journal row in the Supabase dashboard → confirm the cover image is cleaned up (or note that this requires a cleanup function, deferred).

### Step-by-step workflow
1. Create `app/journal/new.tsx`. Add it to `app/_layout.tsx` as a stack modal.
2. Build Step 1: title input with a 60-character counter. "Next" button advances to Step 2 or validates inline.
3. Build Step 2: cover picker. Hard-code the 8 swatch colors as constants. Add a "Choose from library" option using `expo-image-picker`. Selected state uses a checkmark.
4. On "Create journal" press: set `isSubmitting = true`. If cover is a photo, upload it first. Then call `supabase.from('journals').insert({ id: clientGeneratedUuid, user_id, title, cover_style, cover_color or cover_image_url })`.
5. On success, call `router.replace({ pathname: '/capture', params: { journal_id: uuid } })`.
6. Update the library screen: replace `MOCK_JOURNALS` with a `useEffect` + `supabase.from('journals').select('*, pages(count)').eq('user_id', userId).order('created_at', { ascending: false })`. The `pages(count)` nested query gives the `pageCount` without a separate query.
7. Commit: "Add journal creation flow and replace library mock data."

---

## 7. Transcription correction and glossary loop

> **Architecture note:** Per Design Decision 1 above, this correction flow lives exclusively in the reader — not in the Review tab. The Review tab is a separate, unrelated feature. Per Design Decision 2, corrections are stored as a `pending_corrections` JSONB array on the page row, not as a normalized `segments` table. Do not introduce a segments model here.

### What and why
The reader screen already shows a "3 to review" badge on pages where `correction_count > 0`. This badge is the only correction entry point. Tapping it opens a correction flow where the user reviews words Gemini was uncertain about, approves or corrects them, and the corrections are saved to the database and fed back into the glossary. This is the personalization loop — the mechanism by which the app learns the user's handwriting over time. The Review tab (Section 10) is a distinct spaced-repetition feature and must not be confused with this.

### Things to watch out for
- **The correction flow has a state machine, not just a list.** The user sees one correction at a time (index 0, 1, 2 …). Each correction has three outcomes: approved ("Looks right"), corrected (saved with the user's edit), or skipped. Skipped corrections should remain in `correction_count`. Approved and corrected ones decrement it. Build a local state machine rather than trying to track this with the database directly — commit to the database only when the user finishes all corrections or closes the sheet.
- **The glossary upsert must handle conflicts correctly.** The SQL is `insert into glossary (user_id, original_word, corrected_word, updated_at) values (...) on conflict (user_id, original_word) do update set corrected_word = excluded.corrected_word, updated_at = now()`. The Supabase JS syntax is `.upsert({ ... }, { onConflict: 'user_id,original_word' })`. Using plain `.insert()` here will create duplicate glossary entries and break the personalization.
- **Do not decrement `correction_count` optimistically on the page row.** Only write it back to the database when the correction session is complete. If the user closes the sheet mid-session, the count should reflect remaining items, not already-reviewed ones.
- **Where does Gemini get the list of "uncertain words" from?** The current frontend uses `hasReviewItems: true` and a static `reviewCount`. In the real implementation, Gemini's response needs to flag uncertain words. The simplest approach: in the Edge Function, after getting the transcription, ask Gemini a second prompt: *"From this transcription, list any words you were uncertain about as a JSON array of strings."* Store this array as a `pending_corrections` JSONB column on `pages`. The correction flow then works through this array.
- **The "Save correction" action must write to both `corrections` and `glossary`.** Writing to only one is a bug. The `corrections` table records history per page; the `glossary` table accumulates learning across all pages. Both writes should happen in a single Supabase RPC call (a database function) to avoid a race condition where one write succeeds and the other fails.

### Must be done
- `pending_corrections` column added to `pages` (type: `jsonb`, default: `'[]'`). Populated by the Edge Function.
- A Supabase RPC function `save_correction(page_id, original_word, corrected_word)` that atomically writes to both `corrections` and `glossary` (upsert).
- Bottom sheet or modal correction UI built in the reader screen.
- Local state machine for tracking progress through the correction list.
- Badge removed (or count updated) after all corrections are resolved.
- `correction_count` updated in the database only when the session is complete.

### Double-check before moving on
- [ ] Complete a correction session → the review badge disappears on the page.
- [ ] Open the Supabase dashboard → `corrections` table has one row per correction saved.
- [ ] Open the `glossary` table → the corrected word appears.
- [ ] Transcribe a new page that contains the same misspelled word → the transcription uses the glossary correction.
- [ ] Attempt to save the same correction twice (repeat session) → no duplicate in `glossary`, only `updated_at` changes.
- [ ] Close the correction sheet mid-session → the badge still shows the remaining count.

### Step-by-step workflow
1. Add `pending_corrections jsonb default '[]'` to the `pages` table via SQL.
2. Update the Edge Function: after the main transcription, make a second Gemini call asking for uncertain words as JSON. Store the result in `pending_corrections`. Update `correction_count` to `jsonb_array_length(pending_corrections)`.
3. Create a Supabase RPC function:
   ```sql
   create or replace function save_correction(
     p_page_id uuid, p_original text, p_corrected text, p_user_id uuid
   ) returns void language plpgsql security definer as $$
   begin
     insert into corrections (page_id, original_word, corrected_word)
       values (p_page_id, p_original, p_corrected);
     insert into glossary (user_id, original_word, corrected_word, updated_at)
       values (p_user_id, p_original, p_corrected, now())
       on conflict (user_id, original_word)
       do update set corrected_word = excluded.corrected_word, updated_at = now();
   end;
   $$;
   ```
4. In the reader screen, when the review badge is tapped, fetch `pending_corrections` for the current page and open the bottom sheet.
5. Build the correction sheet: a `useState` for the current index, the original word shown in context, a text input pre-filled with the word. "Looks right" advances the index. "Save correction" calls the RPC, then advances.
6. On session complete (index reaches end), update `pages.correction_count = 0` and `pages.pending_corrections = '[]'`. Close the sheet.
7. Commit: "Add correction flow, glossary upsert RPC, and Edge Function uncertain-word detection."

---

## 8. Replace mock data throughout

### What and why
The library screen uses `MOCK_JOURNALS`, the reader uses `SAMPLE_PAGES`. These must be replaced with live Supabase queries once the schema and write paths are working. Each screen should be migrated atomically — mock data stays until the full round-trip (insert, query, display) is verified for that screen. Migrating both at once makes debugging harder.

### Things to watch out for
- **Signed URLs expire.** Supabase Storage signed URLs are valid for a configurable duration (default: 1 hour). Do not store signed URLs in the database — store the storage path and generate signed URLs at query time. Generating 20 signed URLs for a library screen of 20 journals is one batch call (`supabase.storage.from('pages').createSignedUrls([...paths], 3600)`), not 20 sequential calls.
- **`pageCount` must come from a join, not a separate query.** Never make N+1 queries (one per journal to get its page count). Use Supabase's PostgREST nested select: `journals.select('*, pages(count)')`. This is a single SQL query.
- **Loading states must be handled.** The library screen currently assumes data is always available. Add a loading skeleton (not a full-screen spinner) so the UI doesn't flash empty → loaded. The journal cards are a natural skeleton shape.
- **Empty state must still work.** The library screen has a fully designed empty state ("Your shelf is empty"). This must appear when the Supabase query returns zero journals, not only when the mock array is empty.
- **The reader's horizontal scroll must initialize at the correct page.** When navigating to the reader from the library, pass the starting `page_number` as a route param and use it to compute the initial scroll offset. With real data, a journal might have 80 pages — scrolling from page 1 to page 47 is bad UX.
- **Realtime subscriptions are optional here.** Supabase offers realtime updates when data changes. For Margin's single-user use case, a simple refetch on screen focus (`useFocusEffect` from expo-router) is sufficient and much simpler than managing a realtime channel.

### Must be done
- Library screen: `MOCK_JOURNALS` replaced with a Supabase query. Loading skeleton added. Empty state wired to zero-rows condition.
- Reader screen: `SAMPLE_PAGES` replaced with a Supabase query for pages in the current journal. Initial scroll offset set from route param.
- All storage paths converted to signed URLs at query time, not stored as signed URLs in the database.
- `pageCount` fetched via nested select, not a separate query.

### Double-check before moving on
- [ ] Create 3 journals via the app → all 3 appear in the library, in correct order (newest first).
- [ ] Create journal, add 2 pages → library card shows "2 pages."
- [ ] Tap a journal → reader opens on page 1 of that journal's actual pages.
- [ ] Navigate away from the library and back → data is still current (not stale from a previous visit).
- [ ] Delete a journal row directly in Supabase dashboard → it disappears from the library without a manual refresh (prove `useFocusEffect` refetch works).
- [ ] Load the library with 0 journals → empty state is shown.

### Step-by-step workflow
1. In the library screen, replace `useState(MOCK_JOURNALS)` with a `useFocusEffect` that calls `supabase.from('journals').select('id, title, cover_style, cover_color, cover_image_url, created_at, pages(count)').eq('user_id', userId).order('created_at', { ascending: false })`.
2. After the query returns, extract cover image storage paths and batch-generate signed URLs.
3. Map the results to the `Journal` type the component already uses, merging in the signed URL.
4. Add a `loading` state. While loading, render the journal card grid with placeholder shimmer boxes at the same dimensions as real cards.
5. Wire the empty state to `!loading && journals.length === 0`.
6. In the reader screen, update the route to accept `journal_id` and `initial_page` params. Fetch pages with `.eq('journal_id', journalId).order('page_number')`. Generate signed URLs for `image_url` paths.
7. Use `initial_page` param to compute the initial `contentOffset` for the horizontal `ScrollView`.
8. Commit: "Replace all mock data with live Supabase queries."

---

## 9. Search

### What and why
The Search tab is a placeholder. Once pages have real transcription text, Postgres full-text search enables searching across all of a user's journal entries. This is a Phase 3 feature — do not build it until the core capture-correct loop is working with real data.

### Things to watch out for
- **Full-text search in Postgres operates on `tsvector` columns.** A generated column (`generated always as ... stored`) recomputes automatically when `transcription_text` is updated. This is the correct approach — do not manually maintain the column.
- **`to_tsvector('english', ...)` uses English stemming.** Searching "walked" will match "walking." If users write in other languages, this stemming may give poor results. For a first version, English is fine. Parameterize the language as `to_tsvector('simple', ...)` if multilingual support is needed — `'simple'` tokenizes without language-specific stemming.
- **Snippet highlighting is not built into PostgREST.** The `ts_headline` Postgres function returns a snippet with matches bolded, but it is not directly accessible via the Supabase JS client's `.textSearch()` shorthand. You need a Supabase RPC function to return `ts_headline` results.
- **Search results should be scoped to the current user via RLS,** but double-check this. The FTS index is on a user's own pages, but confirm the RLS policy correctly filters by `user_id` through the `journals` join.
- **Debounce the search input.** Do not fire a database query on every keystroke. Use a 300ms debounce. React's `useEffect` with a `setTimeout` cleanup is sufficient — no library needed.

### Must be done
- `fts` generated column added to `pages` table.
- A Supabase RPC function `search_pages(query text)` returning page ID, journal title, page number, and a `ts_headline` snippet.
- Search screen built with a debounced input and result list.
- Each result shows journal name, page number, and highlighted snippet.
- Tapping a result navigates to the reader at the correct page.

### Double-check before moving on
- [ ] Search for a word that exists in a page transcription → correct result appears.
- [ ] Search for a word that belongs to another user's pages → no results (RLS is enforced through the RPC function).
- [ ] Search with an empty string → no results, no error.
- [ ] Rapidly type and delete characters → confirm only one query fires per 300ms window (check Supabase dashboard logs).
- [ ] Tap a search result → reader opens at the exact correct page.

### Step-by-step workflow
1. Add the FTS column via SQL migration:
   ```sql
   alter table pages
     add column fts tsvector
     generated always as (to_tsvector('english', coalesce(transcription_text, ''))) stored;
   create index on pages using gin(fts);
   ```
2. Create the RPC function:
   ```sql
   create or replace function search_pages(query text)
   returns table (page_id uuid, journal_id uuid, journal_title text,
                  page_number integer, snippet text)
   language sql security definer as $$
     select p.id, j.id, j.title, p.page_number,
            ts_headline('english', p.transcription_text, plainto_tsquery('english', query),
                        'MaxWords=20, MinWords=10') as snippet
     from pages p
     join journals j on j.id = p.journal_id
     where j.user_id = auth.uid()
       and p.fts @@ plainto_tsquery('english', query)
     order by ts_rank(p.fts, plainto_tsquery('english', query)) desc
     limit 20;
   $$;
   ```
3. Build the search screen: text input at top, result list below. Each row shows journal title, "Page N", and the snippet with matched terms styled differently.
4. Wrap the query call in a 300ms debounce using `useEffect` with `clearTimeout` cleanup.
5. On result tap, navigate to reader with `journal_id` and `initial_page` params.
6. Commit: "Add full-text search with ts_headline snippets."

---

## 10. Review / Resurface tab

> **Architecture note:** Per Design Decision 1 above, this tab is a Readwise-style spaced repetition feature — it has nothing to do with transcription correction. If someone asks "shouldn't the Review tab show words to correct?" — the answer is no. Corrections live in the reader's badge flow (Section 7). The Review tab resurfaces old memories. These are two different user needs and must remain two different features. Do not merge them.

### What and why
The Review tab says "Resurface past entries and rediscover your memories" — this is a spaced-repetition memory feature, not a transcription correction queue. The correction badge in the journal reader (Section 7) is the correction entry point. Once per day (or on demand), this tab surfaces a past journal page the user may have forgotten, in a reading-card format. It is a Phase 3 feature and should not be built until Sections 1–8 are complete and working with real data.

### Things to watch out for
- **`order by random()` is inefficient on large tables** because it requires a full table scan. For a personal app (hundreds of pages, not millions), it is completely fine. Do not over-engineer this with a weighted scoring algorithm until you have evidence of a performance problem.
- **The UI design for this screen does not exist.** The placeholder shows a star icon. Before writing any code, the card layout, quote-style typography, and daily/on-demand mechanic must be designed. This is one of the screens to request from the mockup process.
- **"Daily" resurface requires tracking which pages have been shown.** If you implement a true daily mechanic (show one new page per day), you need a `resurfaced_at` timestamp on pages, or a separate `resurfaced_pages` table. Without this, `order by random()` may show the same page multiple times in a row. For a first version, random-with-no-tracking is acceptable.
- **Showing the original photo vs the transcription text** is a product decision. The reader screen already has a toggle for this. The resurface card should start with the transcription (the readable version) and have a "show original" option, not the other way around.
- **Do not use a real subscription or push notification for the daily resurface** in Phase 3. A simple check on tab focus ("has today's resurface been set?") is sufficient. Push notifications require significantly more infrastructure (APNs certificates, FCM tokens) and a separate notification service.

### Must be done
- A `resurfaced_at` timestamp column on `pages` (nullable, set when a page is surfaced).
- Supabase query that selects a page not resurfaced recently (`resurfaced_at is null or resurfaced_at < now() - interval '7 days'`), filtered by the current user, ordered randomly.
- Full UI design completed before any code is written.
- The resurface card shows the page transcription text with the journal name and date.
- A "Next" button fetches and shows another random page, updating `resurfaced_at` on the current one.

### Double-check before moving on
- [ ] Tap the Review tab → a page card appears (not a placeholder).
- [ ] Tap "Next" → a different page appears.
- [ ] Check the Supabase dashboard → `resurfaced_at` was updated on the viewed page.
- [ ] View all pages (exhaust the unsurfaced pool) → app gracefully shows "You're all caught up" rather than an error.
- [ ] Confirm the page shown belongs to the logged-in user (RLS check).

### Step-by-step workflow
1. Add `resurfaced_at timestamptz` column to `pages` (nullable, default null).
2. Create an RPC function:
   ```sql
   create or replace function get_resurface_page()
   returns setof pages language sql security definer as $$
     select * from pages p
     join journals j on j.id = p.journal_id
     where j.user_id = auth.uid()
       and p.transcription_status = 'done'
       and (p.resurfaced_at is null or p.resurfaced_at < now() - interval '7 days')
     order by random()
     limit 1;
   $$;
   ```
3. Finalize the UI design (see the mockup prompt output) before writing the screen component.
4. Build the screen: fetch a page on tab focus, render the card. "Next" button calls the RPC again and updates `resurfaced_at` on the previous page.
5. Handle the empty pool: if the RPC returns no rows, show a "You're all caught up" state.
6. Commit: "Add review/resurface tab with random page surfacing."

---

## Deferred features — do not build yet

**Async transcription queue.** A `transcription_status` column on `pages` is already sufficient to model retries. Add a real queue (Redis, Supabase Queues, or BullMQ) only when Gemini 429 rate limits become a measured problem, not in anticipation of one.

**Apple Sign-In.** Requires Apple Developer membership, a configured App ID with Sign In with Apple capability, and a service ID with the redirect URL registered. Defer until Google OAuth is confirmed working and you are preparing for App Store submission.

**Segment-level inline highlighting.** Rendering tappable correction spans inline within the transcription body requires a custom text renderer (wrapping each word in a `Text` component within a `View` with `flexWrap: 'wrap'`). This is significant work and fragile. The correction bottom sheet in Section 7 delivers the same value with a fraction of the complexity. Revisit only if users specifically report that finding the flagged word in context is confusing.

**Handwriting fine-tuning.** Gemini fine-tuning requires a labeled dataset, a Google Cloud project with Vertex AI, and ongoing cost. The glossary injection approach delivers meaningful personalization at zero incremental cost. Do not pursue fine-tuning until you have at least 6 months of real correction data and can measure whether fine-tuning improves over glossary injection.

**Multi-user collaboration.** The entire schema assumes a single owner per journal (`user_id`). Adding collaboration requires a `journal_members` join table, policy updates on every table, and careful consideration of what "editing" means for shared transcriptions. Do not add collaboration until the single-user experience is fully polished.
