-- ============================================================================
-- Phase 1 — Team + Chat.
-- ============================================================================
-- Channels, membership, messages, and read tracking. The security core here is
-- membership-based RLS: a user can read/write a channel's messages ONLY while a
-- channel_members row exists for them. Removing a member revokes everything
-- immediately, including history (spec §3.3).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type channel_type as enum ('management', 'general', 'custom', 'event', 'dm');
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_kind as enum ('user', 'system');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.channels (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  type       channel_type not null default 'custom',
  event_id   uuid,
  created_by uuid references public.users(id) on delete set null,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

-- Exactly one general and one management channel (singletons).
create unique index if not exists channels_singleton_idx
  on public.channels (type)
  where type in ('general', 'management');

create table if not exists public.channel_members (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  added_by   uuid references public.users(id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index if not exists channel_members_user_idx on public.channel_members (user_id);

create table if not exists public.messages (
  id             uuid primary key default gen_random_uuid(),
  channel_id     uuid not null references public.channels(id) on delete cascade,
  sender_id      uuid references public.users(id) on delete set null, -- null for system
  kind           message_kind not null default 'user',
  body           text,
  attachment_url text,
  -- Localized system messages: the client renders `system_event` via i18n
  -- (e.g. {"type":"member_added","actor":"…","target":"…"}) — spec §4.8.
  system_event   jsonb,
  deleted        boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists messages_channel_created_idx
  on public.messages (channel_id, created_at);

-- Per-user, per-channel read marker for unread counts.
create table if not exists public.message_reads (
  channel_id   uuid not null references public.channels(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Membership helper. SECURITY DEFINER so RLS policies on channel_members /
-- messages can call it without recursing into their own tables.
-- ---------------------------------------------------------------------------
create or replace function public.is_channel_member(p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.channel_members m
    where m.channel_id = p_channel
      and m.user_id = public.current_app_user_id()
  );
$$;

-- Unread counts for the current user across their channels: messages newer than
-- their read marker, excluding their own and deleted messages.
create or replace function public.channel_unread_counts()
returns table (channel_id uuid, unread integer)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select public.current_app_user_id() as uid)
  select m.channel_id, count(*)::int as unread
  from public.messages m
  join public.channel_members cm
    on cm.channel_id = m.channel_id and cm.user_id = (select uid from me)
  left join public.message_reads r
    on r.channel_id = m.channel_id and r.user_id = (select uid from me)
  where m.deleted = false
    and m.sender_id is distinct from (select uid from me)
    and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
  group by m.channel_id;
$$;

-- ---------------------------------------------------------------------------
-- Auto channels: ensure the two singletons exist, then keep membership synced.
-- ---------------------------------------------------------------------------
insert into public.channels (name, type)
  select 'general', 'general'
  where not exists (select 1 from public.channels where type = 'general');
insert into public.channels (name, type)
  select 'management', 'management'
  where not exists (select 1 from public.channels where type = 'management');

-- Add/remove a user to the auto channels based on their role + active status.
-- SECURITY DEFINER: runs on user insert/update and must bypass RLS.
create or replace function public.sync_auto_channel_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  general_id uuid;
  mgmt_id uuid;
begin
  select id into general_id from public.channels where type = 'general' limit 1;
  select id into mgmt_id from public.channels where type = 'management' limit 1;

  if new.active then
    -- Everyone is in general.
    insert into public.channel_members (channel_id, user_id)
      values (general_id, new.id)
      on conflict do nothing;
    -- Owner + managers are in management; others are kept out.
    if new.role in ('owner', 'manager') then
      insert into public.channel_members (channel_id, user_id)
        values (mgmt_id, new.id)
        on conflict do nothing;
    else
      delete from public.channel_members where channel_id = mgmt_id and user_id = new.id;
    end if;
  else
    -- Deactivation removes the user from all channels (spec §4.1).
    delete from public.channel_members where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists users_sync_channels on public.users;
create trigger users_sync_channels
  after insert or update of role, active on public.users
  for each row execute function public.sync_auto_channel_membership();

-- Backfill existing users into the auto channels.
do $$
declare u record;
begin
  for u in select id, role, active from public.users loop
    if u.active then
      insert into public.channel_members (channel_id, user_id)
        select id, u.id from public.channels where type = 'general'
        on conflict do nothing;
      if u.role in ('owner', 'manager') then
        insert into public.channel_members (channel_id, user_id)
          select id, u.id from public.channels where type = 'management'
          on conflict do nothing;
      end if;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- System messages on membership changes (custom/event/dm channels only — the
-- auto channels would otherwise spam on every hire). The client localizes.
-- ---------------------------------------------------------------------------
create or replace function public.post_membership_system_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ch_type channel_type;
  actor_name text;
  target_name text;
  target_user uuid;
  evt_type text;
begin
  if tg_op = 'INSERT' then
    target_user := new.user_id;
    evt_type := 'member_added';
    select type into ch_type from public.channels where id = new.channel_id;
  else
    target_user := old.user_id;
    evt_type := 'member_removed';
    select type into ch_type from public.channels where id = old.channel_id;
  end if;

  if ch_type in ('general', 'management') then
    return coalesce(new, old);
  end if;

  -- Skip self-actions (e.g. a creator joining their own channel, or leaving).
  if target_user = public.current_app_user_id() then
    return coalesce(new, old);
  end if;

  select name into target_name from public.users where id = target_user;
  select name into actor_name from public.users where id = public.current_app_user_id();

  insert into public.messages (channel_id, kind, system_event)
  values (
    coalesce(new.channel_id, old.channel_id),
    'system',
    jsonb_build_object('type', evt_type, 'actor', actor_name, 'target', target_name)
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists channel_members_system_msg_ins on public.channel_members;
create trigger channel_members_system_msg_ins
  after insert on public.channel_members
  for each row execute function public.post_membership_system_message();

drop trigger if exists channel_members_system_msg_del on public.channel_members;
create trigger channel_members_system_msg_del
  after delete on public.channel_members
  for each row execute function public.post_membership_system_message();

-- ---------------------------------------------------------------------------
-- Realtime: broadcast row changes on messages and membership.
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.channel_members;
exception when duplicate_object then null; end $$;

grant execute on function public.is_channel_member(uuid) to authenticated;
grant execute on function public.channel_unread_counts() to authenticated;
