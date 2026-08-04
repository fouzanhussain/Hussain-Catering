-- ============================================================================
-- Phase 0 — Foundation: users, roles, permission flags, and helper functions.
-- ============================================================================
-- Money/attendance/payroll tables arrive in later phases. This migration only
-- establishes identity: the `users` profile table keyed to Supabase Auth, plus
-- the SECURITY DEFINER helpers that RLS policies (migration 0002) depend on.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------
do $$ begin
  create type app_role as enum ('owner', 'manager', 'employee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pay_group as enum ('group_1_15', 'group_5_20');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rounding_mode as enum ('cent', 'dollar');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Default permission flags per role.
-- Roles set the defaults; the jsonb `permissions` column overrides per person.
-- Application code checks flags, not roles (spec §3.1).
-- ---------------------------------------------------------------------------
create or replace function public.default_permissions(role app_role)
returns jsonb
language sql
immutable
as $$
  select case role
    when 'owner' then jsonb_build_object(
      'view_payroll', true, 'manage_attendance', true, 'manage_events', true,
      'manage_vendors', true, 'log_cash', true, 'log_advances', true,
      'approve_inventory', true, 'create_channels', true)
    when 'manager' then jsonb_build_object(
      'view_payroll', false, 'manage_attendance', true, 'manage_events', true,
      'manage_vendors', true, 'log_cash', true, 'log_advances', true,
      'approve_inventory', true, 'create_channels', true)
    else jsonb_build_object(
      'view_payroll', false, 'manage_attendance', false, 'manage_events', false,
      'manage_vendors', false, 'log_cash', false, 'log_advances', false,
      'approve_inventory', false, 'create_channels', false)
  end;
$$;

-- ---------------------------------------------------------------------------
-- users: the app profile. auth_id links to auth.users; null until the invited
-- person completes phone OTP signup (linked by the trigger below).
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  auth_id       uuid unique references auth.users(id) on delete set null,
  name          text not null,
  phone         text,
  email         text,
  role          app_role not null default 'employee',
  permissions   jsonb not null default '{}'::jsonb,
  language      text not null default 'en' check (language in ('en', 'es')),
  active        boolean not null default true,
  hire_date     date,
  avatar_url    text,
  -- Owner-only fields (RLS in later phases keeps managers away from pay data;
  -- pay_group/rounding_mode live here but rates/amounts never do).
  pay_group     pay_group,
  rounding_mode rounding_mode not null default 'cent',
  created_at    timestamptz not null default now()
);

-- Normalized-phone lookups (digits only) for auth linking and de-duplication.
create index if not exists users_phone_digits_idx
  on public.users (regexp_replace(coalesce(phone, ''), '\D', '', 'g'));

-- Fill missing flags with the role defaults on insert/update so `permissions`
-- always carries a complete set (role default merged with explicit overrides).
create or replace function public.apply_default_permissions()
returns trigger
language plpgsql
as $$
begin
  new.permissions := public.default_permissions(new.role) || coalesce(new.permissions, '{}'::jsonb);
  return new;
end;
$$;

drop trigger if exists users_apply_permissions on public.users;
create trigger users_apply_permissions
  before insert or update of role, permissions on public.users
  for each row execute function public.apply_default_permissions();

-- ---------------------------------------------------------------------------
-- Helper functions used by RLS. SECURITY DEFINER so they bypass RLS on
-- `users` — otherwise a policy that queries `users` would recurse infinitely.
-- ---------------------------------------------------------------------------
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.users where auth_id = auth.uid() limit 1;
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where auth_id = auth.uid() and role = 'owner' and active
  );
$$;

-- Flag check (spec: "Code checks flags, not roles"). Owner implicitly holds all.
create or replace function public.app_has_permission(flag text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where auth_id = auth.uid()
      and active
      and (role = 'owner' or coalesce((permissions ->> flag)::boolean, false))
  );
$$;

-- ---------------------------------------------------------------------------
-- Link a newly-created auth user to a pre-provisioned profile by phone number
-- (owner invites by phone; the person then completes OTP signup — spec §4.1).
-- Matches on digits-only phone and only fills an unlinked profile.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  digits text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
begin
  if digits <> '' then
    update public.users u
      set auth_id = new.id,
          email = coalesce(u.email, new.email)
      where u.auth_id is null
        and regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') = digits;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
