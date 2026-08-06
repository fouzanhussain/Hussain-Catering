-- ============================================================================
-- Security hardening — pin search_path on remaining mutable-search_path functions.
-- ============================================================================
-- The Supabase security advisor (function_search_path_mutable) flagged four
-- trigger functions added in earlier migrations that didn't set search_path.
-- Every other function in the schema already does this; these were the
-- oversights. A mutable search_path lets a caller who can create objects in a
-- schema earlier in their session's search_path shadow unqualified references
-- (e.g. a table or function name) inside the function body. None of these four
-- read external state — set_updated_at and attendance_block_locked touch only
-- NEW/OLD, apply_default_permissions and cash_advance_init_balance call one
-- already-schema-qualified function — so pinning search_path is defense in
-- depth, not a fix for an active exploit.

alter function public.apply_default_permissions() set search_path = public;
alter function public.attendance_block_locked() set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.cash_advance_init_balance() set search_path = public;
