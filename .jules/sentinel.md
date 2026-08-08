## 2025-02-23 - [Supabase RPC Authorization Bypass]
**Vulnerability:** Supabase RPC functions in SQL migrations were declared using `SECURITY DEFINER`.
**Learning:** `SECURITY DEFINER` causes the function to execute with the privileges of the user that created it (often a superuser), effectively bypassing Row Level Security (RLS) policies and potentially allowing unauthorized data access across tenants.
**Prevention:** Always use `SECURITY INVOKER` when creating RPC functions in Supabase to ensure they run with the permissions of the calling user and respect RLS policies appropriately, unless elevated privileges are explicitly required and carefully constrained.
