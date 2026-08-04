-- ============================================================================
-- Phase 0 — Deny-all RLS baseline.
-- ============================================================================
-- Security posture: enable RLS everywhere and grant nothing implicitly. The
-- only table that exists yet is `users`; we open the minimum needed for auth
-- and self-service, and reserve all writes for the owner. Every future table
-- inherits this same "enable RLS, no policy = no access" default.

alter table public.users enable row level security;
alter table public.users force row level security;

-- Clean slate if re-run.
drop policy if exists users_select_self on public.users;
drop policy if exists users_select_owner on public.users;
drop policy if exists users_update_self_language on public.users;
drop policy if exists users_owner_insert on public.users;
drop policy if exists users_owner_update on public.users;
drop policy if exists users_owner_delete on public.users;

-- Read: a user can always see their own profile row.
create policy users_select_self on public.users
  for select
  using (auth_id = auth.uid());

-- Read: the owner sees everyone.
create policy users_select_owner on public.users
  for select
  using (public.is_owner());

-- Update: a signed-in user may change only their own language preference.
-- (All other profile fields — role, permissions, pay_group, rates — are
-- owner-controlled. Column-level lock is enforced in the WITH CHECK below by
-- requiring every owner-only field to remain equal to its current value.)
create policy users_update_self_language on public.users
  for update
  using (auth_id = auth.uid())
  with check (
    auth_id = auth.uid()
    and role = (select role from public.users me where me.auth_id = auth.uid())
    and active = (select active from public.users me where me.auth_id = auth.uid())
    and coalesce(pay_group::text, '') =
        coalesce((select pay_group::text from public.users me where me.auth_id = auth.uid()), '')
    and rounding_mode = (select rounding_mode from public.users me where me.auth_id = auth.uid())
    and permissions = (select permissions from public.users me where me.auth_id = auth.uid())
  );

-- Full management is owner-only. Edge Functions use the service role, which
-- bypasses RLS entirely, for automated provisioning.
create policy users_owner_insert on public.users
  for insert
  with check (public.is_owner());

create policy users_owner_update on public.users
  for update
  using (public.is_owner())
  with check (public.is_owner());

-- Soft-delete is the norm (NFR §8); a hard DELETE stays owner-only regardless.
create policy users_owner_delete on public.users
  for delete
  using (public.is_owner());

-- Helper functions must be callable by authenticated clients (they run as
-- definer and only ever return booleans/ids about the caller).
grant execute on function public.is_owner() to authenticated;
grant execute on function public.app_has_permission(text) to authenticated;
grant execute on function public.current_app_user_id() to authenticated;
