-- ============================================================================
-- Phase 7 — Notifications + Web Push.
-- ============================================================================
-- In-app notifications and the web-push subscriptions the fan-out Edge Function
-- delivers to. Fan-out (INSERT notifications + send push) runs with the service
-- role; clients only read/ack their own.

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx
  on public.notifications (user_id, read, created_at desc);

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  endpoint   text not null unique,
  keys       jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.notifications force row level security;

drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists notifications_delete_own on public.notifications;
drop policy if exists notifications_insert_owner on public.notifications;

-- Read / ack (mark read) / dismiss your own. The Edge Function (service role)
-- bypasses RLS to fan out; the owner may also insert directly.
create policy notifications_select_own on public.notifications
  for select using (user_id = public.current_app_user_id());
create policy notifications_update_own on public.notifications
  for update using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());
create policy notifications_delete_own on public.notifications
  for delete using (user_id = public.current_app_user_id());
create policy notifications_insert_owner on public.notifications
  for insert with check (public.is_owner());

alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;

drop policy if exists push_subscriptions_own on public.push_subscriptions;

-- A user fully manages their own device subscriptions.
create policy push_subscriptions_own on public.push_subscriptions
  for all
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());
