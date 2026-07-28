# Margin

This workspace contains two frontends:

- `artifacts/margin` - the main Expo mobile app
- `artifacts/mockup-sandbox` - the web mockup playground

## Requirements

- **Node 22+** (Node 24 recommended). pnpm will error on Node 20.
  ```bash
  nvm use 24
  ```

## Before you run

1. **Create the env file** at `artifacts/margin/.env`:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
   ```
   The app will throw on launch without these.

2. **Apply the database schema** — paste the contents of `supabase/migrations/001_init_schema.sql` into the Supabase SQL editor and run it.

3. **Create storage buckets** in the Supabase dashboard (Storage → New bucket, set to Private):
   - `journal_pages` — stores captured page photos
   - `covers` — stores journal cover photos

4. **Deploy the transcription Edge Function**:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase secrets set GEMINI_API_KEY=<key> SUPABASE_SERVICE_ROLE_KEY=<key>
   supabase functions deploy transcribe
   ```

## First-time setup

Install dependencies from the repo root. This pulls every workspace package at once:

```bash
pnpm install
```

If prompted about build scripts, run `pnpm approve-builds` then `pnpm install --force`.

## Run

Start the main frontend:

```bash
pnpm --filter @workspace/margin dev
```

Start the web mockup frontend:

```bash
pnpm --filter @workspace/mockup-sandbox dev
```

## Other useful commands

```bash
pnpm run typecheck
pnpm run build
```
