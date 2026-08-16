
## 2024-05-18 - Search Path Hijacking in Supabase RPCs
**Vulnerability:** Several Supabase RPC functions used `SECURITY DEFINER` (executing with owner privileges) without strictly binding `search_path` (using `SET search_path = public` or `public, auth`).
**Learning:** This exposes a privilege escalation and search path hijacking vulnerability, where malicious schemas or functions could be executed instead of the intended ones when querying un-schema-qualified tables.
**Prevention:** Always default to `SECURITY INVOKER` when RLS provides sufficient security, as `SECURITY DEFINER` bypasses RLS if it's the DB owner. If `SECURITY DEFINER` is strictly necessary (e.g. to query `auth.users`), the function must explicitly bind its execution context via `SET search_path = ''` and all schema objects must be fully qualified (e.g., `public.table_name`, `auth.users`).
