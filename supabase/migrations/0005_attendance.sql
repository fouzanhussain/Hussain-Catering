-- ============================================================================
-- Phase 2 — Attendance (manager-only marking).
-- ============================================================================
-- Managers/owner mark attendance for every employee; there is no employee
-- self check-in (spec §4.2). Hourly staff need check-in/out times from which
-- hours are computed (overnight-aware). Edits are audited and freeze once the
-- covering pay period is locked (the `locked` flag; pay periods arrive Phase 4).

-- ---------------------------------------------------------------------------
-- Pay basis. Lives on `users` as operational info the manager needs to know
-- whether to collect clock times. It is NOT a rate or amount — the salary
-- blindness rule concerns pay figures (salary_rates, added in Phase 4), so
-- exposing basis to managers here does not leak earnings.
-- ---------------------------------------------------------------------------
do $$ begin
  create type salary_basis as enum ('per_day', 'hourly', 'semi_monthly_salary');
exception when duplicate_object then null; end $$;

alter table public.users
  add column if not exists pay_basis salary_basis;

-- ---------------------------------------------------------------------------
-- Attendance status
-- ---------------------------------------------------------------------------
do $$ begin
  create type attendance_status as enum
    ('present', 'absent', 'half_day', 'excused_paid', 'excused_unpaid');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- attendance: one row per employee per day.
-- ---------------------------------------------------------------------------
create table if not exists public.attendance (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  date          date not null,
  status        attendance_status not null,
  -- Hourly staff. check_out_at is a full timestamp, so overnight shifts are
  -- represented by a checkout on the following calendar day (spec §4.2).
  check_in_at   timestamptz,
  check_out_at  timestamptz,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  -- Worked hours, clamped at zero and rounded to 2 decimals. Full precision is
  -- kept for payroll math in Phase 4; this stored value is for display/summary.
  hours_worked  numeric generated always as (
    case
      when check_in_at is not null and check_out_at is not null then
        greatest(
          0,
          round(
            (extract(epoch from (check_out_at - check_in_at)) / 3600.0)
              - (break_minutes / 60.0),
            2
          )
        )
      else null
    end
  ) stored,
  event_id      uuid,                       -- linked in Phase 3 (Events)
  marked_by     uuid references public.users(id) on delete set null,
  edited_by     uuid references public.users(id) on delete set null,
  edit_reason   text,
  locked        boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists attendance_date_idx on public.attendance (date);
create index if not exists attendance_user_date_idx on public.attendance (user_id, date);

-- ---------------------------------------------------------------------------
-- Audit + integrity triggers.
-- ---------------------------------------------------------------------------
-- Stamp the acting user server-side so it can't be spoofed by the client.
create or replace function public.attendance_stamp_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.marked_by := coalesce(new.marked_by, public.current_app_user_id());
  else
    new.edited_by := public.current_app_user_id();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_stamp on public.attendance;
create trigger attendance_stamp
  before insert or update on public.attendance
  for each row execute function public.attendance_stamp_actor();

-- Freeze locked rows: once locked, the row cannot be modified. Locking itself
-- (false → true) is the only permitted transition and is done by Phase 4's
-- period-lock Edge Function (service role) or the owner.
create or replace function public.attendance_block_locked()
returns trigger
language plpgsql
as $$
begin
  if old.locked then
    raise exception 'attendance row % is locked and cannot be modified', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_guard_locked on public.attendance;
create trigger attendance_guard_locked
  before update on public.attendance
  for each row execute function public.attendance_block_locked();
