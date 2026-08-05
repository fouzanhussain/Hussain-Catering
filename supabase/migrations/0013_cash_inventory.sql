-- ============================================================================
-- Phase 6 — Cash Envelope Log + Inventory Requests.
-- ============================================================================
-- Structured records with a comment thread each (not a chat). Cash entries have
-- a two-tap custody chain (filer files → owner confirms → deposited), every
-- transition logged with actor + timestamp (spec §4.6). Inventory is a request
-- queue employees can submit to, decided by approve_inventory holders (§4.7).

do $$ begin
  create type cash_status as enum ('picked_up', 'delivered_to_owner', 'deposited');
exception when duplicate_object then null; end $$;

do $$ begin
  create type inventory_urgency as enum ('normal', 'urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type inventory_status as enum ('requested', 'approved', 'rejected', 'purchased', 'received');
exception when duplicate_object then null; end $$;

do $$ begin
  create type comment_entity as enum ('cash', 'inventory', 'vendor_payment', 'advance');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- cash_entries + custody log
-- ---------------------------------------------------------------------------
create table if not exists public.cash_entries (
  id            uuid primary key default gen_random_uuid(),
  amount        numeric(12, 2) not null check (amount >= 0),
  event_id      uuid references public.events(id) on delete set null,
  picked_up_by  uuid references public.users(id) on delete set null,
  handed_to     uuid references public.users(id) on delete set null,
  status        cash_status not null default 'picked_up',
  photo_url     text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists cash_entries_status_idx on public.cash_entries (status);
create index if not exists cash_entries_picked_up_idx on public.cash_entries (picked_up_by);

drop trigger if exists cash_entries_set_updated_at on public.cash_entries;
create trigger cash_entries_set_updated_at
  before update on public.cash_entries
  for each row execute function public.set_updated_at();

create table if not exists public.cash_entry_log (
  id            uuid primary key default gen_random_uuid(),
  cash_entry_id uuid not null references public.cash_entries(id) on delete cascade,
  from_status   cash_status,
  to_status     cash_status not null,
  acted_by      uuid references public.users(id) on delete set null,
  at            timestamptz not null default now()
);
create index if not exists cash_entry_log_entry_idx on public.cash_entry_log (cash_entry_id);

-- Record every custody transition (and the initial pickup). SECURITY DEFINER so
-- it can write the log regardless of the actor's RLS on cash_entry_log.
create or replace function public.log_cash_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.cash_entry_log (cash_entry_id, from_status, to_status, acted_by)
    values (new.id, null, new.status, coalesce(new.picked_up_by, public.current_app_user_id()));
  elsif new.status is distinct from old.status then
    insert into public.cash_entry_log (cash_entry_id, from_status, to_status, acted_by)
    values (new.id, old.status, new.status, public.current_app_user_id());
  end if;
  return new;
end;
$$;

drop trigger if exists cash_entries_log_ins on public.cash_entries;
create trigger cash_entries_log_ins
  after insert on public.cash_entries
  for each row execute function public.log_cash_status();

drop trigger if exists cash_entries_log_upd on public.cash_entries;
create trigger cash_entries_log_upd
  after update on public.cash_entries
  for each row execute function public.log_cash_status();

-- ---------------------------------------------------------------------------
-- inventory_requests
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_requests (
  id           uuid primary key default gen_random_uuid(),
  item         text not null,
  qty          numeric(10, 2),
  unit         text,
  urgency      inventory_urgency not null default 'normal',
  needed_by    date,
  event_id     uuid references public.events(id) on delete set null,
  status       inventory_status not null default 'requested',
  requested_by uuid references public.users(id) on delete set null,
  decided_by   uuid references public.users(id) on delete set null,
  photo_url    text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists inventory_status_idx on public.inventory_requests (status);
create index if not exists inventory_requested_by_idx on public.inventory_requests (requested_by);

drop trigger if exists inventory_set_updated_at on public.inventory_requests;
create trigger inventory_set_updated_at
  before update on public.inventory_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- comments: one thread per record, across entity types (spec §5).
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  entity_type comment_entity not null,
  entity_id   uuid not null,
  sender_id   uuid references public.users(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists comments_entity_idx on public.comments (entity_type, entity_id, created_at);

-- Can the current user access the target record? Used by comment RLS so a
-- comment is visible exactly to whoever can see the thing it's attached to.
-- SECURITY DEFINER to read the underlying tables without recursing through RLS.
create or replace function public.can_access_entity(p_type comment_entity, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare me uuid := public.current_app_user_id();
begin
  if p_type = 'cash' then
    return exists (
      select 1 from public.cash_entries e
      where e.id = p_id
        and (public.app_has_permission('log_cash') or public.is_owner()
             or e.picked_up_by = me or e.handed_to = me));
  elsif p_type = 'inventory' then
    return exists (
      select 1 from public.inventory_requests r
      where r.id = p_id
        and (public.app_has_permission('approve_inventory') or public.is_owner()
             or r.requested_by = me));
  elsif p_type = 'vendor_payment' then
    return public.app_has_permission('manage_vendors');
  elsif p_type = 'advance' then
    return exists (
      select 1 from public.cash_advances a
      where a.id = p_id
        and (public.app_has_permission('log_advances') or a.user_id = me));
  end if;
  return false;
end;
$$;

grant execute on function public.can_access_entity(comment_entity, uuid) to authenticated;

-- Private bucket for cash/inventory photos.
insert into storage.buckets (id, name, public)
  values ('ops-photos', 'ops-photos', false)
  on conflict (id) do nothing;
