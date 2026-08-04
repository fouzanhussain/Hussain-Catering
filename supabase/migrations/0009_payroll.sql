-- ============================================================================
-- Phase 4 — Payroll.
-- ============================================================================
-- The most business-specific part of the system. Money is `numeric`, never
-- float. Intermediate math keeps full precision; rounding is applied once to
-- the final net (see the app/edge computation). Salary figures live only in
-- these tables and are locked behind view_payroll (spec §3.2 salary blindness).

do $$ begin
  create type advance_method as enum ('cash', 'zelle', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pay_period_status as enum ('open', 'review', 'locked', 'paid');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- salary_rates: append-only rate history. The computation uses the rate whose
-- effective_date is on/before the period end (spec §4.5.5).
-- ---------------------------------------------------------------------------
create table if not exists public.salary_rates (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  basis          salary_basis not null,
  amount         numeric(12, 2) not null check (amount >= 0),
  effective_date date not null,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists salary_rates_user_eff_idx
  on public.salary_rates (user_id, effective_date desc);

-- ---------------------------------------------------------------------------
-- pay_periods: two parallel tracks, one per pay group. Every calendar day
-- belongs to exactly one period within each track (spec §4.5.2).
-- ---------------------------------------------------------------------------
create table if not exists public.pay_periods (
  id          uuid primary key default gen_random_uuid(),
  pay_group   pay_group not null,
  start_date  date not null,
  end_date    date not null,
  payout_date date not null,
  status      pay_period_status not null default 'open',
  locked_at   timestamptz,
  locked_by   uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (pay_group, start_date)
);

-- ---------------------------------------------------------------------------
-- payroll_entries: one computed row per (period, employee).
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_entries (
  id                    uuid primary key default gen_random_uuid(),
  pay_period_id         uuid not null references public.pay_periods(id) on delete cascade,
  user_id               uuid not null references public.users(id) on delete cascade,
  basis_snapshot        salary_basis,
  rate_snapshot         numeric(12, 2),
  present_days          numeric(6, 2) not null default 0,
  half_days             numeric(6, 2) not null default 0,
  absent_days           numeric(6, 2) not null default 0,
  excused_paid          numeric(6, 2) not null default 0,
  excused_unpaid        numeric(6, 2) not null default 0,
  total_hours           numeric(8, 2) not null default 0,
  gross                 numeric(12, 2) not null default 0,
  advances_deducted     numeric(12, 2) not null default 0,
  adjustments_total     numeric(12, 2) not null default 0,
  net                   numeric(12, 2) not null default 0,
  carryover             numeric(12, 2) not null default 0,
  rounding_mode_snapshot rounding_mode,
  computed_at           timestamptz,
  paid_at               timestamptz,
  paid_method           text,
  unique (pay_period_id, user_id)
);
create index if not exists payroll_entries_user_idx on public.payroll_entries (user_id);

-- ---------------------------------------------------------------------------
-- payroll_adjustments: manual line items added during review (bonus, tip
-- share, correction). amount may be positive or negative.
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_adjustments (
  id               uuid primary key default gen_random_uuid(),
  payroll_entry_id uuid not null references public.payroll_entries(id) on delete cascade,
  amount           numeric(12, 2) not null,
  reason           text,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists payroll_adjustments_entry_idx
  on public.payroll_adjustments (payroll_entry_id);

-- ---------------------------------------------------------------------------
-- cash_advances: money advanced to an employee. Contains NO salary data, so
-- managers with log_advances can see the ledger (spec §3.2 / §4.5.3).
-- remaining_balance rolls across periods as it is deducted.
-- ---------------------------------------------------------------------------
create table if not exists public.cash_advances (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  amount            numeric(12, 2) not null check (amount > 0),
  date              date not null default (now() at time zone 'utc')::date,
  method            advance_method not null default 'cash',
  note              text,
  recorded_by       uuid references public.users(id) on delete set null,
  acknowledged_at   timestamptz,
  remaining_balance numeric(12, 2) not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists cash_advances_user_idx on public.cash_advances (user_id);
create index if not exists cash_advances_open_idx
  on public.cash_advances (user_id) where remaining_balance > 0;

-- New advances start fully outstanding.
create or replace function public.cash_advance_init_balance()
returns trigger
language plpgsql
as $$
begin
  if new.remaining_balance is null or new.remaining_balance = 0 then
    new.remaining_balance := new.amount;
  end if;
  return new;
end;
$$;

drop trigger if exists cash_advance_init on public.cash_advances;
create trigger cash_advance_init
  before insert on public.cash_advances
  for each row execute function public.cash_advance_init_balance();

-- ---------------------------------------------------------------------------
-- advance_deductions: which advance was applied to which payroll entry.
-- ---------------------------------------------------------------------------
create table if not exists public.advance_deductions (
  id              uuid primary key default gen_random_uuid(),
  cash_advance_id uuid not null references public.cash_advances(id) on delete cascade,
  payroll_entry_id uuid not null references public.payroll_entries(id) on delete cascade,
  amount          numeric(12, 2) not null,
  created_at      timestamptz not null default now()
);
create index if not exists advance_deductions_entry_idx
  on public.advance_deductions (payroll_entry_id);
create index if not exists advance_deductions_advance_idx
  on public.advance_deductions (cash_advance_id);
