-- ============================================================================
-- Phase 5 — Vendor Payment Planner.
-- ============================================================================
-- Vendors and their scheduled payments. Managed by manage_vendors holders
-- (managers/owner by default); not employee-facing (spec §4.4).

do $$ begin
  create type payment_method as enum ('cash', 'zelle', 'check', 'card', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vendor_payment_status as enum ('scheduled', 'paid', 'overdue', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.vendors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text,
  category   text,
  notes      text,
  active     boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vendors_active_idx on public.vendors (active);

drop trigger if exists vendors_set_updated_at on public.vendors;
create trigger vendors_set_updated_at
  before update on public.vendors
  for each row execute function public.set_updated_at();

create table if not exists public.vendor_payments (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendors(id) on delete cascade,
  amount        numeric(12, 2) not null check (amount >= 0),
  due_date      date not null,
  method        payment_method not null default 'cash',
  status        vendor_payment_status not null default 'scheduled',
  event_id      uuid references public.events(id) on delete set null,
  paid_at       timestamptz,
  paid_by       uuid references public.users(id) on delete set null,
  receipt_url   text,
  notes         text,
  -- Remind this many days before the due date (default 2); fan-out is Phase 7.
  reminder_days integer not null default 2 check (reminder_days >= 0),
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists vendor_payments_due_idx on public.vendor_payments (due_date);
create index if not exists vendor_payments_vendor_idx on public.vendor_payments (vendor_id);
create index if not exists vendor_payments_status_idx on public.vendor_payments (status);

drop trigger if exists vendor_payments_set_updated_at on public.vendor_payments;
create trigger vendor_payments_set_updated_at
  before update on public.vendor_payments
  for each row execute function public.set_updated_at();

-- Private bucket for receipt photos; access gated by manage_vendors (below).
insert into storage.buckets (id, name, public)
  values ('vendor-receipts', 'vendor-receipts', false)
  on conflict (id) do nothing;
