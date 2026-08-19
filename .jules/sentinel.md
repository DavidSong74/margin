## 2024-08-19 - Secure Supabase RPC Search Paths

**Vulnerability:** Search path hijacking in Supabase `SECURITY DEFINER` RPC functions. Several functions such as `get_comments`, `get_user_stats`, `find_user_by_email` were using `SET search_path = public` or `SET search_path = public, auth`. This could allow an attacker to create maliciously crafted tables or functions in a schema earlier in the search path (if they somehow gained those privileges or if another vulnerability allowed it) that could intercept the RPC's execution context, leading to privilege escalation.

**Learning:** When using `SECURITY DEFINER` in Postgres (and therefore Supabase), the search path must be tightly controlled so that objects (tables, views, functions) resolve exactly to the intended schemas, preventing malicious overrides. A `SECURITY DEFINER` function executes with the privileges of the user who created it (often a superuser or the `postgres` role).

**Prevention:** Always use `SET search_path = ''` in `SECURITY DEFINER` functions to clear the search path, ensuring that all object references within the function body must be explicitly and fully schema-qualified (e.g., `public.users`, `auth.users`).
