// Payroll data access + owner-side computation (Phase 4).
//
// The owner (and only the owner, per RLS) reads salary rates + attendance +
// advances and writes payroll_entries. Computation delegates to the tested,
// shared core in ./payroll so numbers match the Edge Function exactly. The
// Edge Function (supabase/functions/compute-payroll) is the production path for
// automation; this client path keeps the app fully functional today.
import { supabase } from './supabase'
import { computeEntry, round2, type PeriodSpec } from './payroll'
import type {
  AdvanceMethod,
  Attendance,
  CashAdvance,
  PayPeriod,
  PayPeriodStatus,
  PayrollAdjustment,
  PayrollEntry,
  SalaryBasis,
  SalaryRate,
  UserProfile,
} from './types'

type Advance = CashAdvance

// --- Salary rates (owner) -------------------------------------------------

export async function listRatesForUser(userId: string): Promise<SalaryRate[]> {
  const { data, error } = await supabase
    .from('salary_rates')
    .select('*')
    .eq('user_id', userId)
    .order('effective_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as SalaryRate[]
}

export async function addSalaryRate(input: {
  user_id: string
  basis: SalaryBasis
  amount: number
  effective_date: string
  created_by: string
}): Promise<SalaryRate> {
  const { data, error } = await supabase.from('salary_rates').insert(input).select('*').single()
  if (error) throw error
  return data as SalaryRate
}

/** Latest rate effective on/before `asOf` for a user (the period-active rate). */
function pickEffectiveRate(rates: SalaryRate[], asOf: string): SalaryRate | null {
  const eligible = rates
    .filter((r) => r.effective_date <= asOf)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))
  return eligible[0] ?? null
}

// --- Pay periods ----------------------------------------------------------

export async function listPeriods(): Promise<PayPeriod[]> {
  const { data, error } = await supabase
    .from('pay_periods')
    .select('*')
    .order('start_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as PayPeriod[]
}

/** Insert a period if one doesn't already exist for (group, start_date). */
export async function ensurePeriod(spec: PeriodSpec): Promise<void> {
  const { error } = await supabase.from('pay_periods').upsert(
    {
      pay_group: spec.pay_group,
      start_date: spec.start_date,
      end_date: spec.end_date,
      payout_date: spec.payout_date,
    },
    { onConflict: 'pay_group,start_date', ignoreDuplicates: true },
  )
  if (error) throw error
}

export async function setPeriodStatus(
  period: PayPeriod,
  status: PayPeriodStatus,
  actorId: string,
): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (status === 'locked') {
    patch.locked_at = new Date().toISOString()
    patch.locked_by = actorId
  }
  const { error } = await supabase.from('pay_periods').update(patch).eq('id', period.id)
  if (error) throw error

  // Locking a period freezes its attendance in range (spec §4.5.5).
  if (status === 'locked') {
    const userIds = await activeUserIdsForGroup(period.pay_group)
    if (userIds.length) {
      const { error: aErr } = await supabase
        .from('attendance')
        .update({ locked: true })
        .in('user_id', userIds)
        .gte('date', period.start_date)
        .lte('date', period.end_date)
        .eq('locked', false)
      if (aErr) throw aErr
    }
  }
}

export async function markPeriodPaid(
  period: PayPeriod,
  method: string,
  actorId: string,
): Promise<void> {
  const paidAt = new Date().toISOString()
  const { error: eErr } = await supabase
    .from('payroll_entries')
    .update({ paid_at: paidAt, paid_method: method })
    .eq('pay_period_id', period.id)
  if (eErr) throw eErr
  await setPeriodStatus(period, 'paid', actorId)
}

// --- Entries / adjustments ------------------------------------------------

export async function listEntries(periodId: string): Promise<PayrollEntry[]> {
  const { data, error } = await supabase
    .from('payroll_entries')
    .select('*')
    .eq('pay_period_id', periodId)
  if (error) throw error
  return (data ?? []) as PayrollEntry[]
}

export async function listMyEntries(userId: string): Promise<PayrollEntry[]> {
  const { data, error } = await supabase
    .from('payroll_entries')
    .select('*')
    .eq('user_id', userId)
    .order('computed_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PayrollEntry[]
}

export async function listAdjustments(entryId: string): Promise<PayrollAdjustment[]> {
  const { data, error } = await supabase
    .from('payroll_adjustments')
    .select('*')
    .eq('payroll_entry_id', entryId)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as PayrollAdjustment[]
}

export async function addAdjustment(input: {
  payroll_entry_id: string
  amount: number
  reason: string | null
  created_by: string
}): Promise<void> {
  const { error } = await supabase.from('payroll_adjustments').insert(input)
  if (error) throw error
}

export async function deleteAdjustment(id: string): Promise<void> {
  const { error } = await supabase.from('payroll_adjustments').delete().eq('id', id)
  if (error) throw error
}

// --- Cash advances --------------------------------------------------------

export async function listAdvances(userId?: string): Promise<Advance[]> {
  let q = supabase.from('cash_advances').select('*').order('date', { ascending: false })
  if (userId) q = q.eq('user_id', userId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Advance[]
}

export async function recordAdvance(input: {
  user_id: string
  amount: number
  date: string
  method: AdvanceMethod
  note: string | null
  recorded_by: string
}): Promise<void> {
  const { error } = await supabase.from('cash_advances').insert(input)
  if (error) throw error
}

export async function acknowledgeAdvance(id: string): Promise<void> {
  const { error } = await supabase
    .from('cash_advances')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// --- Computation ----------------------------------------------------------

async function activeUsersForGroup(group: string): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('active', true)
    .eq('pay_group', group)
  if (error) throw error
  return (data ?? []) as UserProfile[]
}

async function activeUserIdsForGroup(group: string): Promise<string[]> {
  return (await activeUsersForGroup(group)).map((u) => u.id)
}

function aggregate(rows: Attendance[]) {
  let presentDays = 0
  let halfDays = 0
  let absentDays = 0
  let excusedPaid = 0
  let excusedUnpaid = 0
  let totalHours = 0
  for (const r of rows) {
    switch (r.status) {
      case 'present':
        presentDays++
        break
      case 'half_day':
        halfDays++
        break
      case 'absent':
        absentDays++
        break
      case 'excused_paid':
        excusedPaid++
        break
      case 'excused_unpaid':
        excusedUnpaid++
        break
    }
    if (r.hours_worked != null) totalHours += Number(r.hours_worked)
  }
  return { presentDays, halfDays, absentDays, excusedPaid, excusedUnpaid, totalHours: round2(totalHours) }
}

/**
 * Compute (or recompute) every employee's entry for a period. Idempotent:
 * existing advance deductions for the period's entries are reversed and
 * re-applied so remaining balances stay correct on repeat runs. Open advances
 * auto-attach FIFO; the uncovered remainder rolls forward as carryover.
 */
export async function computePeriod(period: PayPeriod, _actorId?: string): Promise<void> {
  const users = await activeUsersForGroup(period.pay_group)
  if (users.length === 0) return
  const userIds = users.map((u) => u.id)

  const { data: attData, error: attErr } = await supabase
    .from('attendance')
    .select('*')
    .in('user_id', userIds)
    .gte('date', period.start_date)
    .lte('date', period.end_date)
  if (attErr) throw attErr
  const attByUser = new Map<string, Attendance[]>()
  for (const row of (attData ?? []) as Attendance[]) {
    const list = attByUser.get(row.user_id) ?? []
    list.push(row)
    attByUser.set(row.user_id, list)
  }

  const existingEntries = await listEntries(period.id)
  const entryByUser = new Map(existingEntries.map((e) => [e.user_id, e]))

  for (const user of users) {
    const rates = await listRatesForUser(user.id)
    const rate = pickEffectiveRate(rates, period.end_date)
    if (!rate) continue // no configured rate → nothing to pay yet

    const existing = entryByUser.get(user.id)

    // Reverse this entry's prior advance deductions (keeps recompute idempotent).
    if (existing) {
      const { data: prior } = await supabase
        .from('advance_deductions')
        .select('*')
        .eq('payroll_entry_id', existing.id)
      for (const d of (prior ?? []) as { id: string; cash_advance_id: string; amount: number }[]) {
        const { data: adv } = await supabase
          .from('cash_advances')
          .select('remaining_balance')
          .eq('id', d.cash_advance_id)
          .single()
        const restored = round2(Number((adv as { remaining_balance: number }).remaining_balance) + Number(d.amount))
        await supabase.from('cash_advances').update({ remaining_balance: restored }).eq('id', d.cash_advance_id)
      }
      await supabase.from('advance_deductions').delete().eq('payroll_entry_id', existing.id)
    }

    // Manual adjustments already attached to the (existing) entry.
    const adjustments = existing ? await listAdjustments(existing.id) : []
    const adjustmentsTotal = round2(adjustments.reduce((s, a) => s + Number(a.amount), 0))

    // Fresh open advances (oldest first for FIFO application).
    const { data: openAdvRows } = await supabase
      .from('cash_advances')
      .select('*')
      .eq('user_id', user.id)
      .gt('remaining_balance', 0)
      .order('date', { ascending: true })
    const openAdvances = (openAdvRows ?? []) as CashAdvance[]
    const openTotal = round2(openAdvances.reduce((s, a) => s + Number(a.remaining_balance), 0))

    const agg = aggregate(attByUser.get(user.id) ?? [])
    const result = computeEntry({
      basis: rate.basis,
      rate: Number(rate.amount),
      ...agg,
      rounding: user.rounding_mode,
      openAdvance: openTotal,
      adjustmentsTotal,
    })

    // Upsert the entry.
    const { data: savedRow, error: upErr } = await supabase
      .from('payroll_entries')
      .upsert(
        {
          pay_period_id: period.id,
          user_id: user.id,
          basis_snapshot: rate.basis,
          rate_snapshot: Number(rate.amount),
          present_days: agg.presentDays,
          half_days: agg.halfDays,
          absent_days: agg.absentDays,
          excused_paid: agg.excusedPaid,
          excused_unpaid: agg.excusedUnpaid,
          total_hours: agg.totalHours,
          gross: result.gross,
          advances_deducted: result.advancesDeducted,
          adjustments_total: result.adjustmentsTotal,
          net: result.net,
          carryover: result.carryover,
          rounding_mode_snapshot: user.rounding_mode,
          computed_at: new Date().toISOString(),
        },
        { onConflict: 'pay_period_id,user_id' },
      )
      .select('id')
      .single()
    if (upErr) throw upErr
    const entryId = (savedRow as { id: string }).id

    // Allocate the deducted amount across open advances FIFO.
    let remaining = result.advancesDeducted
    for (const adv of openAdvances) {
      if (remaining <= 0) break
      const d = round2(Math.min(Number(adv.remaining_balance), remaining))
      if (d <= 0) continue
      await supabase.from('advance_deductions').insert({
        cash_advance_id: adv.id,
        payroll_entry_id: entryId,
        amount: d,
      })
      await supabase
        .from('cash_advances')
        .update({ remaining_balance: round2(Number(adv.remaining_balance) - d) })
        .eq('id', adv.id)
      remaining = round2(remaining - d)
    }
  }
}
