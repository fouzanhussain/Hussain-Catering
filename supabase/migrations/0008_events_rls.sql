-- ============================================================================
-- Phase 3 — Events RLS.
-- ============================================================================
-- manage_events holders (managers/owner by default) have full access.
-- Employees can read only events they are assigned to.

alter table public.events enable row level security;
alter table public.events force row level security;

drop policy if exists events_select on public.events;
drop policy if exists events_insert on public.events;
drop policy if exists events_update on public.events;
drop policy if exists events_delete on public.events;

-- Read: managers/owner see all; employees see only their assigned events.
create policy events_select on public.events
  for select
  using (
    public.app_has_permission('manage_events')
    or public.is_event_staff(id)
  );

create policy events_insert on public.events
  for insert
  with check (public.app_has_permission('manage_events'));

create policy events_update on public.events
  for update
  using (public.app_has_permission('manage_events'))
  with check (public.app_has_permission('manage_events'));

create policy events_delete on public.events
  for delete
  using (public.app_has_permission('manage_events'));

-- ---------------------------------------------------------------------------
-- event_staff
-- ---------------------------------------------------------------------------
alter table public.event_staff enable row level security;
alter table public.event_staff force row level security;

drop policy if exists event_staff_select on public.event_staff;
drop policy if exists event_staff_insert on public.event_staff;
drop policy if exists event_staff_delete on public.event_staff;

-- Read: managers/owner see all assignments; a user sees their own, and
-- co-assignees on events they're part of.
create policy event_staff_select on public.event_staff
  for select
  using (
    public.app_has_permission('manage_events')
    or user_id = public.current_app_user_id()
    or public.is_event_staff(event_id)
  );

create policy event_staff_insert on public.event_staff
  for insert
  with check (public.app_has_permission('manage_events'));

create policy event_staff_delete on public.event_staff
  for delete
  using (public.app_has_permission('manage_events'));
