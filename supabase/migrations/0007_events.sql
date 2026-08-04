-- ============================================================================
-- Phase 3 — Events Calendar.
-- ============================================================================
-- Events with assigned staff. Managers/owner manage everything; employees see
-- only the events they're assigned to (spec §4.3). Assigning staff can
-- optionally spin up an event chat channel (created app-side, archived when the
-- event completes/cancels).

do $$ begin
  create type event_status as enum ('inquiry', 'confirmed', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

-- Generic updated_at bumper reused across tables.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  client_name  text,
  client_phone text,
  venue        text,
  date         date not null,
  start_time   time,
  end_time     time,
  headcount    integer check (headcount is null or headcount >= 0),
  status       event_status not null default 'inquiry',
  notes        text,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists events_date_idx on public.events (date);
create index if not exists events_status_idx on public.events (status);

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create table if not exists public.event_staff (
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_staff_user_idx on public.event_staff (user_id);

-- Now that events exists, wire the previously-loose event_id references.
do $$ begin
  alter table public.channels
    add constraint channels_event_id_fkey
    foreign key (event_id) references public.events(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.attendance
    add constraint attendance_event_id_fkey
    foreign key (event_id) references public.events(id) on delete set null;
exception when duplicate_object then null; end $$;

-- Is the current user assigned to this event? SECURITY DEFINER so RLS policies
-- on events / event_staff can use it without recursing.
create or replace function public.is_event_staff(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.event_staff es
    where es.event_id = p_event
      and es.user_id = public.current_app_user_id()
  );
$$;

grant execute on function public.is_event_staff(uuid) to authenticated;
