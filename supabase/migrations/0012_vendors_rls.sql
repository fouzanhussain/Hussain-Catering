-- ============================================================================
-- Phase 5 — Vendor RLS.
-- ============================================================================
-- manage_vendors holders (managers/owner by default) can read/insert/update.
-- Not employee-facing. Hard DELETE is owner-only (vendors carry payment
-- history; deactivate instead). Commands are split so the "all" path never
-- silently grants DELETE to managers.

-- --- vendors --------------------------------------------------------------
alter table public.vendors enable row level security;
alter table public.vendors force row level security;

drop policy if exists vendors_manage on public.vendors;
drop policy if exists vendors_select on public.vendors;
drop policy if exists vendors_insert on public.vendors;
drop policy if exists vendors_update on public.vendors;
drop policy if exists vendors_delete_owner on public.vendors;

create policy vendors_select on public.vendors
  for select using (public.app_has_permission('manage_vendors'));
create policy vendors_insert on public.vendors
  for insert with check (public.app_has_permission('manage_vendors'));
create policy vendors_update on public.vendors
  for update using (public.app_has_permission('manage_vendors'))
  with check (public.app_has_permission('manage_vendors'));
create policy vendors_delete_owner on public.vendors
  for delete using (public.is_owner());

-- --- vendor_payments ------------------------------------------------------
alter table public.vendor_payments enable row level security;
alter table public.vendor_payments force row level security;

drop policy if exists vendor_payments_manage on public.vendor_payments;
drop policy if exists vendor_payments_select on public.vendor_payments;
drop policy if exists vendor_payments_insert on public.vendor_payments;
drop policy if exists vendor_payments_update on public.vendor_payments;
drop policy if exists vendor_payments_delete_owner on public.vendor_payments;

create policy vendor_payments_select on public.vendor_payments
  for select using (public.app_has_permission('manage_vendors'));
create policy vendor_payments_insert on public.vendor_payments
  for insert with check (public.app_has_permission('manage_vendors'));
create policy vendor_payments_update on public.vendor_payments
  for update using (public.app_has_permission('manage_vendors'))
  with check (public.app_has_permission('manage_vendors'));
create policy vendor_payments_delete_owner on public.vendor_payments
  for delete using (public.is_owner());

-- --- storage: vendor-receipts --------------------------------------------
drop policy if exists vendor_receipts_read on storage.objects;
drop policy if exists vendor_receipts_write on storage.objects;

create policy vendor_receipts_read on storage.objects
  for select
  to authenticated
  using (bucket_id = 'vendor-receipts' and public.app_has_permission('manage_vendors'));

create policy vendor_receipts_write on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'vendor-receipts' and public.app_has_permission('manage_vendors'));
