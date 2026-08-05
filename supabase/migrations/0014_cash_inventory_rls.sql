-- ============================================================================
-- Phase 6 — Cash / Inventory / Comments RLS.
-- ============================================================================

-- --- cash_entries ---------------------------------------------------------
-- Visible to log_cash holders, the owner, and the people in the custody chain.
alter table public.cash_entries enable row level security;
alter table public.cash_entries force row level security;

drop policy if exists cash_entries_select on public.cash_entries;
drop policy if exists cash_entries_insert on public.cash_entries;
drop policy if exists cash_entries_update on public.cash_entries;
drop policy if exists cash_entries_delete_owner on public.cash_entries;

create policy cash_entries_select on public.cash_entries
  for select
  using (
    public.app_has_permission('log_cash')
    or picked_up_by = public.current_app_user_id()
    or handed_to = public.current_app_user_id()
  );

-- File a pickup as yourself (log_cash holders).
create policy cash_entries_insert on public.cash_entries
  for insert
  with check (
    public.app_has_permission('log_cash')
    and picked_up_by = public.current_app_user_id()
  );

-- Owner advances the custody chain; the filer may correct their own entry only
-- while it is still 'picked_up' (before the owner confirms receipt).
create policy cash_entries_update on public.cash_entries
  for update
  using (
    public.is_owner()
    or (picked_up_by = public.current_app_user_id() and status = 'picked_up')
  )
  with check (
    public.is_owner()
    or (picked_up_by = public.current_app_user_id())
  );

create policy cash_entries_delete_owner on public.cash_entries
  for delete
  using (public.is_owner());

-- --- cash_entry_log (read-only; written by the SECURITY DEFINER trigger) ---
alter table public.cash_entry_log enable row level security;
alter table public.cash_entry_log force row level security;

drop policy if exists cash_entry_log_select on public.cash_entry_log;
create policy cash_entry_log_select on public.cash_entry_log
  for select
  using (
    public.app_has_permission('log_cash')
    or exists (
      select 1 from public.cash_entries e
      where e.id = cash_entry_id
        and (e.picked_up_by = public.current_app_user_id()
             or e.handed_to = public.current_app_user_id()))
  );

-- --- inventory_requests ---------------------------------------------------
-- Approvers/owner see all; requesters see their own. Any active employee may
-- submit (spec §4.7). Approvers/owner decide; the requester can edit their own
-- only while still 'requested'.
alter table public.inventory_requests enable row level security;
alter table public.inventory_requests force row level security;

drop policy if exists inventory_select on public.inventory_requests;
drop policy if exists inventory_insert on public.inventory_requests;
drop policy if exists inventory_update on public.inventory_requests;
drop policy if exists inventory_delete_owner on public.inventory_requests;

create policy inventory_select on public.inventory_requests
  for select
  using (
    public.app_has_permission('approve_inventory')
    or requested_by = public.current_app_user_id()
  );

create policy inventory_insert on public.inventory_requests
  for insert
  with check (requested_by = public.current_app_user_id());

create policy inventory_update on public.inventory_requests
  for update
  using (
    public.app_has_permission('approve_inventory')
    or (requested_by = public.current_app_user_id() and status = 'requested')
  )
  with check (
    public.app_has_permission('approve_inventory')
    or (requested_by = public.current_app_user_id())
  );

create policy inventory_delete_owner on public.inventory_requests
  for delete
  using (public.is_owner());

-- --- comments -------------------------------------------------------------
-- Visible/insertable to whoever can access the target record; delete-own (or
-- owner). Uses can_access_entity() so each thread inherits its record's rules.
alter table public.comments enable row level security;
alter table public.comments force row level security;

drop policy if exists comments_select on public.comments;
drop policy if exists comments_insert on public.comments;
drop policy if exists comments_delete on public.comments;

create policy comments_select on public.comments
  for select
  using (public.can_access_entity(entity_type, entity_id));

create policy comments_insert on public.comments
  for insert
  with check (
    sender_id = public.current_app_user_id()
    and public.can_access_entity(entity_type, entity_id)
  );

create policy comments_delete on public.comments
  for delete
  using (sender_id = public.current_app_user_id() or public.is_owner());

-- --- storage: ops-photos --------------------------------------------------
-- Paths are `cash/…` or `inventory/…`. Cash photos require log_cash; inventory
-- photos are open to any signed-in staff member.
drop policy if exists ops_photos_read on storage.objects;
drop policy if exists ops_photos_write on storage.objects;

create policy ops_photos_read on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'ops-photos'
    and (
      name like 'inventory/%'
      or public.app_has_permission('log_cash')
    )
  );

create policy ops_photos_write on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'ops-photos'
    and (
      name like 'inventory/%'
      or (name like 'cash/%' and public.app_has_permission('log_cash'))
    )
  );
