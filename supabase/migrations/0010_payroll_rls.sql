-- ============================================================================
-- Phase 4 — Payroll RLS (the salary-blindness core, spec §3.2).
-- ============================================================================
-- Salary figures (rates, periods, entries, adjustments) are readable only by
-- the owner / view_payroll holders and by each employee for their own rows.
-- Writes are owner-only; Edge Functions use the service role (bypasses RLS).
--
-- Note: app_has_permission('view_payroll') already returns true for the owner,
-- so it doubles as "can view payroll".

-- --- salary_rates ---------------------------------------------------------
alter table public.salary_rates enable row level security;
alter table public.salary_rates force row level security;

drop policy if exists salary_rates_select on public.salary_rates;
drop policy if exists salary_rates_owner_write on public.salary_rates;

create policy salary_rates_select on public.salary_rates
  for select
  using (
    public.app_has_permission('view_payroll')
    or user_id = public.current_app_user_id()
  );

create policy salary_rates_owner_write on public.salary_rates
  for all
  using (public.is_owner())
  with check (public.is_owner());

-- --- pay_periods ----------------------------------------------------------
alter table public.pay_periods enable row level security;
alter table public.pay_periods force row level security;

drop policy if exists pay_periods_select on public.pay_periods;
drop policy if exists pay_periods_owner_write on public.pay_periods;

-- Periods carry no per-person salary, but the payroll screen is owner-only;
-- restrict reads to view_payroll holders.
create policy pay_periods_select on public.pay_periods
  for select
  using (public.app_has_permission('view_payroll'));

create policy pay_periods_owner_write on public.pay_periods
  for all
  using (public.is_owner())
  with check (public.is_owner());

-- --- payroll_entries ------------------------------------------------------
alter table public.payroll_entries enable row level security;
alter table public.payroll_entries force row level security;

drop policy if exists payroll_entries_select on public.payroll_entries;
drop policy if exists payroll_entries_owner_write on public.payroll_entries;

create policy payroll_entries_select on public.payroll_entries
  for select
  using (
    public.app_has_permission('view_payroll')
    or user_id = public.current_app_user_id()
  );

create policy payroll_entries_owner_write on public.payroll_entries
  for all
  using (public.is_owner())
  with check (public.is_owner());

-- --- payroll_adjustments --------------------------------------------------
alter table public.payroll_adjustments enable row level security;
alter table public.payroll_adjustments force row level security;

drop policy if exists payroll_adjustments_select on public.payroll_adjustments;
drop policy if exists payroll_adjustments_owner_write on public.payroll_adjustments;

create policy payroll_adjustments_select on public.payroll_adjustments
  for select
  using (
    public.app_has_permission('view_payroll')
    or exists (
      select 1 from public.payroll_entries e
      where e.id = payroll_entry_id and e.user_id = public.current_app_user_id()
    )
  );

create policy payroll_adjustments_owner_write on public.payroll_adjustments
  for all
  using (public.is_owner())
  with check (public.is_owner());

-- --- cash_advances --------------------------------------------------------
-- No salary data here, so managers with log_advances may read/insert; the
-- employee reads their own. Balance edits (splits, deductions) are owner-only.
alter table public.cash_advances enable row level security;
alter table public.cash_advances force row level security;

drop policy if exists cash_advances_select on public.cash_advances;
drop policy if exists cash_advances_insert on public.cash_advances;
drop policy if exists cash_advances_owner_update on public.cash_advances;
drop policy if exists cash_advances_ack_own on public.cash_advances;

create policy cash_advances_select on public.cash_advances
  for select
  using (
    public.app_has_permission('log_advances')
    or user_id = public.current_app_user_id()
  );

create policy cash_advances_insert on public.cash_advances
  for insert
  with check (public.app_has_permission('log_advances'));

create policy cash_advances_owner_update on public.cash_advances
  for update
  using (public.is_owner())
  with check (public.is_owner());

-- --- advance_deductions ---------------------------------------------------
alter table public.advance_deductions enable row level security;
alter table public.advance_deductions force row level security;

drop policy if exists advance_deductions_select on public.advance_deductions;
drop policy if exists advance_deductions_owner_write on public.advance_deductions;

create policy advance_deductions_select on public.advance_deductions
  for select
  using (
    public.app_has_permission('view_payroll')
    or exists (
      select 1 from public.cash_advances a
      where a.id = cash_advance_id and a.user_id = public.current_app_user_id()
    )
  );

create policy advance_deductions_owner_write on public.advance_deductions
  for all
  using (public.is_owner())
  with check (public.is_owner());
