# Margin — Pending Engineering Tasks & Detailed Technical Specifications

> **File Location:** `todo_claude.md`  
> **Last Updated:** August 19, 2026  
> **Status:** All completed tasks (`SEC-01` through `07`, `PERF-01` through `04`, `FEAT-01`, `FEAT-03`, `BUG-01`, Adaptive Icon) have been removed. The remaining pending tasks below contain hyper-specific implementation details so nothing is left to guess.

---

## Status at a Glance

| # | Item | Target File(s) | Category | Status / Priority |
|---|------|----------------|----------|-------------------|
| **E4** | Verify Gemini API key & secrets in Supabase Vault | Supabase Dashboard / CLI | Operations | 🟡 Important |
| **D1** | Replace App Store review URL placeholder | `artifacts/margin/app/(tabs)/profile.tsx` | Release | ⏸ Blocked — needs Apple App ID |
| **FEAT-02** | Semantic Vector Search via `pgvector` | `supabase/migrations/018_pgvector_search.sql` | Feature | 💡 Roadmap |
| **D2** | iCloud Backup Integration | `artifacts/margin/app/(tabs)/profile.tsx` | Feature | ⏸ Deferred |
| **D3** | Google Drive Backup Integration | `artifacts/margin/lib/googleDrive.ts`, `profile.tsx` | Feature | ⏸ Deferred |
| **D4** | Home Screen Widget ("On This Day" / Streak) | `targets/widget` | Feature | ⏸ Deferred |
| **FEAT-04** | Trial Limits & Transcription Paywall ($1/100 pages) | `supabase/migrations/018_paywall.sql`, `transcribe/index.ts` | Monetization | 💡 Roadmap |
| **FEAT-05** | "Buy Me a Coffee" / Tip Jar (IAP & Supporter Perks) | `artifacts/margin/components/TipJarModal.tsx`, `profile.tsx`, `019_tipjar.sql` | Monetization | 💡 Roadmap |

---

## Context & Architecture Standards

- **Key AsyncStorage Key:** `"margin:settings"` — stores user settings as a JSON object.
- **Preferences Interface:** Defined in [`artifacts/margin/app/(tabs)/profile.tsx`](file:///Users/songdavid93374/Projects/margin/artifacts/margin/app/(tabs)/profile.tsx) under the `Prefs` type. Any new preference must update `Prefs` type, `DEFAULT_PREFS`, `savePref()`, and the storage loader `useEffect`.
- **Supabase Client:** `import { supabase } from "@/lib/supabase"`.
- **UI & Styling Tokens:** `import { useColors } from "@/hooks/useColors"`.
- **TypeScript Rules:** Strict type definitions (`no implicit any`), explicit error handling, zero non-null assertions unless presence is guaranteed.

---

## Technical Specifications for Pending Tasks

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

---

### FEAT-04. Trial Limits & Transcription Paywall

* **Target Files:**
  - `supabase/migrations/018_paywall.sql`
  - `supabase/functions/transcribe/index.ts`
  - `artifacts/margin/app/paywall.tsx`
* **Priority:** 💡 Monetization Roadmap

#### Problem
Transcriptions cost API credits. Users should be given a generous free trial of 100 pages, after which they must purchase top-ups (e.g., $1 for an additional 100 transcriptions) via RevenueCat or Stripe.

#### Technical Direction
1. Add `transcriptions_remaining` (default 100) to a new `public.user_limits` table tied to `auth.users`.
2. Update the `transcribe` Edge Function to check `transcriptions_remaining > 0` before calling Gemini. Deduct 1 from the limit upon a successful transcription.
3. Build a React Native screen that integrates RevenueCat (`react-native-purchases`) to offer a consumable "$1 for 100 pages" IAP.
4. Set up a webhook from RevenueCat to Supabase to increment `transcriptions_remaining` when a purchase is successful.

---

### FEAT-05. "Buy Me a Coffee" / Tip Jar (Fleshed Out)

* **Target Files:**
  - `artifacts/margin/app/(tabs)/profile.tsx` (Profile screen entry row)
  - `artifacts/margin/components/TipJarModal.tsx` (Editorial tipping bottom sheet / modal)
  - `artifacts/margin/lib/purchases.ts` (RevenueCat wrapper)
  - `supabase/migrations/019_tipjar.sql` (Supporter status & tips ledger)
* **Priority:** 💡 Monetization Roadmap

#### 1. Problem & Product Intent
Allow passionate users to voluntarily support Margin's development without gating core handwriting recognition or journal reader features behind mandatory fees. In exchange, supporters receive cosmetic badges, exclusive foil cover accents, and gratitude from the developer.

#### 2. App Store & Platform Compliance (CRITICAL)
* **Apple Guideline 3.2.1(vii) / 3.1.1 (StoreKit Requirement):** Digital tips on iOS **must** be implemented via In-App Purchases (IAP). Linking directly to external payment processors (e.g. Ko-fi, BuyMeACoffee, Stripe, PayPal) from within the native iOS binary violates Apple guidelines and results in **immediate App Store rejection**.
* **Platform Splitting:**
  - **Native (iOS / Android):** Use RevenueCat (`react-native-purchases`) consumable IAPs.
  - **Web (`Platform.OS === 'web'`):** Safely fallback to opening an external Ko-fi / BuyMeACoffee link via `Linking.openURL()`.

#### 3. RevenueCat Consumable Product Catalog
Configure an Offering named `tip_jar` with three consumable tiers:
1. **`margin_tip_small` ($0.99):** "Espresso Tip" ☕️
2. **`margin_tip_medium` ($2.99):** "Cold Brew Tip" 🧋
3. **`margin_tip_large` ($4.99):** "Artisan Roast Tip" 🫘

#### 4. Database Schema & State Persistence
Tips are consumable transactions in StoreKit, but supporter perks must persist across devices.
```sql
-- supabase/migrations/019_tipjar.sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_supporter BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_tipped_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supporter_badge_style TEXT DEFAULT 'gold_quill';

CREATE TABLE IF NOT EXISTS public.tips_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL UNIQUE,
  amount_cents INTEGER NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.record_tip(
  p_transaction_id TEXT,
  p_amount_cents INTEGER,
  p_platform TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.tips_ledger (user_id, transaction_id, amount_cents, platform)
  VALUES (auth.uid(), p_transaction_id, p_amount_cents, p_platform)
  ON CONFLICT (transaction_id) DO NOTHING;

  UPDATE public.profiles
  SET is_supporter = true,
      total_tipped_cents = total_tipped_cents + p_amount_cents,
      updated_at = now()
  WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$;
```

#### 5. UI/UX Workflow
1. **Profile Entry Point:** Add a "Support Margin ☕️" row item in `profile.tsx` under a "Community & Support" section.
2. **Tip Jar Modal (`components/TipJarModal.tsx`):**
   - Matches Margin's paper-and-ink aesthetic (`#faf7f2` paper background, Playfair Display typography, warm sage accents).
   - Shows a warm note explaining how user tips fund Gemini OCR server costs and continuous development.
   - Three horizontal/grid tip cards displaying localized pricing fetched dynamically from RevenueCat.
   - Custom haptic triggers upon selection (`Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)`).
3. **Celebration & Perk Unlock:**
   - On successful purchase, trigger `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)`.
   - Call `supabase.rpc('record_tip', ...)` to persist the user's supporter status.
   - Show an animated wax seal / golden quill "Supporter" badge on their profile avatar and in shared feed entries.

