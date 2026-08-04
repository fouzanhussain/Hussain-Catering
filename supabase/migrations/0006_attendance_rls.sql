-- ============================================================================
-- Phase 2 — Attendance RLS.
-- ============================================================================
-- Manager-only marking: only manage_attendance holders (managers/owner by
-- default) may INSERT/UPDATE. Employees can read their own rows; managers and
-- the owner read everyone's. No DELETE — attendance is never hard-deleted (NFR).

alter table public.attendance enable row level security;
alter table public.attendance force row level security;

drop policy if exists attendance_select on public.attendance;
drop policy if exists attendance_insert_manager on public.attendance;
drop policy if exists attendance_update_manager on public.attendance;

-- Read: own rows, or all rows for manage_attendance holders / owner.
create policy attendance_select on public.attendance
  for select
  using (
    user_id = public.current_app_user_id()
    or public.app_has_permission('manage_attendance')
  );

-- Insert: manage_attendance holders only (no employee self check-in).
create policy attendance_insert_manager on public.attendance
  for insert
  with check (public.app_has_permission('manage_attendance'));

-- Update: manage_attendance holders. The locked-row freeze is enforced by the
-- attendance_block_locked trigger (migration 0005).
create policy attendance_update_manager on public.attendance
  for update
  using (public.app_has_permission('manage_attendance'))
  with check (public.app_has_permission('manage_attendance'));
