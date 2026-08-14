# Margin — Remaining Work

## Status at a glance

| # | Item | File | Status |
|---|------|------|--------|
| D1 | Fix App Store URL placeholder | `profile.tsx` | ⏸ Blocked — needs App Store ID |
| D2 | iCloud backup | — | ⏸ Defer |
| D3 | Google Drive backup | — | ⏸ Defer |
| D4 | Home screen widget | — | ⏸ Defer |
| E1 | Add Supabase env vars to `eas.json` preview profile | `eas.json` | 🔴 Critical — build won't work without this |
| E2 | Design a proper splash screen | `assets/images/` | 🟡 Polish — currently reuses icon.png |
| E3 | Add Android adaptive icon | `assets/images/` | 🟡 Polish — avoids awkward icon cropping on Android |
| E4 | Verify Gemini API key in Supabase Vault | Supabase dashboard | 🟡 Important — transcription fails without it |

---

## Context that applies everywhere

- **Key AsyncStorage key:** `"margin:settings"` — all user preferences live here as a JSON object.
- **`Prefs` type and `savePref()` helper** are both in `artifacts/margin/app/(tabs)/profile.tsx`. Any new preference must be added to this type AND to the `savePref` function's `current` object AND loaded in the `useEffect` that reads from AsyncStorage.
- **Supabase client** is `import { supabase } from "@/lib/supabase"`.
- **Color tokens** come from `import { useColors } from "@/hooks/useColors"`.
- **TypeScript** — no `any`, no non-null assertions unless the value is genuinely guaranteed.

---

### D1. Fix App Store URL placeholder

**File:** `artifacts/margin/app/(tabs)/profile.tsx`

Currently the `onPress` for "Rate on the App Store" uses a dummy Apple ID.

```tsx
          <Row
            icon="star"
            label="Rate on the App Store"
            onPress={() =>
              Linking.openURL(
                "itms-apps://itunes.apple.com/app/id1234567890?action=write-review"
              )
            }
          />
```

We need the actual App Store ID once the app is created in App Store Connect. Until then, do not modify.

---

### E1. Add Supabase env vars to `eas.json`

**File:** `artifacts/margin/eas.json`

The `.env` file is gitignored and never uploaded to EAS Cloud. The `preview` and `production` build profiles need the Supabase keys injected directly into their `env` blocks so the app can reach the backend.

```json
"preview": {
  "distribution": "internal",
  "env": {
    "APP_ENV": "preview",
    "EXPO_PUBLIC_SUPABASE_URL": "https://<your-project-ref>.supabase.co",
    "EXPO_PUBLIC_SUPABASE_ANON_KEY": "<your-anon-key>"
  }
},
"production": {
  "autoIncrement": true,
  "env": {
    "APP_ENV": "production",
    "EXPO_PUBLIC_SUPABASE_URL": "https://<your-project-ref>.supabase.co",
    "EXPO_PUBLIC_SUPABASE_ANON_KEY": "<your-anon-key>"
  }
}
```

> ⚠️ Never commit real keys here if the repo is public. Use EAS Secrets instead: `eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value <value>` and reference them as environment variables.

---

### E2. Proper splash screen

**Files:** `assets/images/splash.png` (new), `app.json`

Currently `splash.image` is set to `icon.png`. For a polished release:
1. Create a `splash.png` — 1284×2778 px, cream background (`#faf7f2`), centered `margin` wordmark or logo.
2. Update `app.json`:
```json
"splash": {
  "image": "./assets/images/splash.png",
  "resizeMode": "contain",
  "backgroundColor": "#faf7f2"
}
```

---

### E3. Android adaptive icon

**Files:** `assets/images/adaptive-icon.png` (new), `app.json`

Android 8+ uses adaptive icons. Without one, the launcher crops the square icon into a circle, which looks awkward.
1. Create `adaptive-icon.png` — 1024×1024 px, the logo/icon centered with generous padding (~30% safe zone on all sides), transparent background.
2. Add to `app.json` under `android`:
```json
"android": {
  "adaptiveIcon": {
    "foregroundImage": "./assets/images/adaptive-icon.png",
    "backgroundColor": "#faf7f2"
  },
  ...
}
```

---

### E4. Verify Gemini API key in Supabase Vault

In your Supabase dashboard:
1. Go to **Project Settings → Edge Functions → Secrets**.
2. Confirm `GEMINI_API_KEY` exists and matches your active Google Cloud API key.
3. If missing, add it. Without this, every transcription request will return a 401 error.
