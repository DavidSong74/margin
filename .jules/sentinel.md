## 2025-07-30 - [CRITICAL] Supabase RPC IDOR via `security definer`
**Vulnerability:** A Supabase RPC function (`save_correction`) was created with `security definer`. This caused the function to run with postgres owner privileges, bypassing Row Level Security (RLS) policies completely. It allowed any authenticated user to pass arbitrary `p_user_id` and `p_page_id` values, mutating data belonging to other users.
**Learning:** When Supabase RPCs run as the creator (`security definer`), they completely ignore the RLS policies established on the underlying tables. Any inputs to such a function must be strictly validated, otherwise it creates an IDOR vulnerability.
**Prevention:** Always use `security invoker` for Supabase RPC functions to ensure they respect the caller's RLS policies. If `security definer` is strictly required, the function MUST explicitly validate the caller's identity (e.g., using `auth.uid()`) and permissions against all inputs provided.

## 2025-07-30 - [CRITICAL] Hardcoded Dev Credentials
**Vulnerability:** A hardcoded email and password (`dev@margin.app` / `devdevdev`) were found in `artifacts/margin/app/index.tsx` for a developer bypass button.
**Learning:** While guarded by `__DEV__`, having hardcoded credentials in the frontend codebase is extremely dangerous. They can easily leak into public repositories, or an accidental misconfiguration of the bundler environment could ship them to production, creating a severe backdoor for attackers.
**Prevention:** Never hardcode credentials, even for development purposes. Use environment variables (e.g., `process.env.EXPO_PUBLIC_DEV_PASSWORD`) or require developers to manually input test credentials.
