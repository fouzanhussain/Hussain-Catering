// ============================================================================
// compute-payroll — server-side payroll computation (Deno Edge Function).
// ============================================================================
// Production path for computing a period with the service role (bypasses RLS).
// The app also computes owner-side via src/lib/payrollApi.ts for interactive
// use; this function is for automation (e.g. a scheduled "move to review").
//
// The math here MUST match src/lib/payroll.ts, which is exhaustively unit-
// tested (scripts/test-payroll.ts). Keep the two in sync.
//
// Deploy: supabase functions deploy compute-payroll
// Invoke: supabase.functions.invoke('compute-payroll', { body: { pay_period_id } })
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPECTED_WORKDAYS = 13

const round2 = (x: number) => Number(x.toFixed(2))
function roundHalfUp(value: number, step: number): number {
  const q = value / step
  const eps = 1e-9 * Math.max(1, Math.abs(q))
  const n = q >= 0 ? Math.floor(q + 0.5 + eps) : Math.ceil(q - 0.5 - eps)
  return round2(n * step)
}

interface Agg {
  presentDays: number
  halfDays: number
  absentDays: number
  excusedPaid: number
  excusedUnpaid: number
  totalHours: number
}

function computeGross(basis: string, rate: number, a: Agg): number {
  switch (basis) {
    case 'per_day':
      return rate * (a.presentDays + a.excusedPaid + 0.5 * a.halfDays)
    case 'hourly':
      return rate * a.totalHours
    case 'semi_monthly_salary': {
      const dv = rate / EXPECTED_WORKDAYS
      return rate - dv * (a.absentDays + a.excusedUnpaid) - 0.5 * dv * a.halfDays
    }
    default:
      return 0
  }
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { pay_period_id } = await req.json()
    if (!pay_period_id) return json({ error: 'pay_period_id required' }, 400)

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''

    // Authorize: the caller must be the owner. Check with their JWT.
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: auth } = await asUser.auth.getUser()
    if (!auth?.user) return json({ error: 'unauthorized' }, 401)
    const { data: me } = await asUser
      .from('users')
      .select('role')
      .eq('auth_id', auth.user.id)
      .maybeSingle()
    if (!me || me.role !== 'owner') return json({ error: 'forbidden' }, 403)

    // Compute with the service role.
    const db = createClient(url, serviceKey)
    const { data: period } = await db.from('pay_periods').select('*').eq('id', pay_period_id).single()
    if (!period) return json({ error: 'period not found' }, 404)
    if (period.status === 'locked' || period.status === 'paid') {
      return json({ error: 'period is frozen' }, 409)
    }

    const { data: users } = await db
      .from('users')
      .select('*')
      .eq('active', true)
      .eq('pay_group', period.pay_group)

    let computed = 0
    for (const user of users ?? []) {
      const { data: rates } = await db
        .from('salary_rates')
        .select('*')
        .eq('user_id', user.id)
        .lte('effective_date', period.end_date)
        .order('effective_date', { ascending: false })
        .limit(1)
      const rate = rates?.[0]
      if (!rate) continue

      const { data: att } = await db
        .from('attendance')
        .select('status, hours_worked')
        .eq('user_id', user.id)
        .gte('date', period.start_date)
        .lte('date', period.end_date)

      const agg: Agg = {
        presentDays: 0, halfDays: 0, absentDays: 0, excusedPaid: 0, excusedUnpaid: 0, totalHours: 0,
      }
      for (const r of att ?? []) {
        if (r.status === 'present') agg.presentDays++
        else if (r.status === 'half_day') agg.halfDays++
        else if (r.status === 'absent') agg.absentDays++
        else if (r.status === 'excused_paid') agg.excusedPaid++
        else if (r.status === 'excused_unpaid') agg.excusedUnpaid++
        if (r.hours_worked != null) agg.totalHours += Number(r.hours_worked)
      }
      agg.totalHours = round2(agg.totalHours)

      // Existing entry + its adjustments; reverse prior deductions (idempotent).
      const { data: existing } = await db
        .from('payroll_entries')
        .select('id')
        .eq('pay_period_id', period.id)
        .eq('user_id', user.id)
        .maybeSingle()

      let adjustmentsTotal = 0
      if (existing) {
        const { data: adjs } = await db
          .from('payroll_adjustments')
          .select('amount')
          .eq('payroll_entry_id', existing.id)
        adjustmentsTotal = round2((adjs ?? []).reduce((s, a) => s + Number(a.amount), 0))

        const { data: prior } = await db
          .from('advance_deductions')
          .select('cash_advance_id, amount')
          .eq('payroll_entry_id', existing.id)
        for (const d of prior ?? []) {
          const { data: adv } = await db
            .from('cash_advances')
            .select('remaining_balance')
            .eq('id', d.cash_advance_id)
            .single()
          await db
            .from('cash_advances')
            .update({ remaining_balance: round2(Number(adv!.remaining_balance) + Number(d.amount)) })
            .eq('id', d.cash_advance_id)
        }
        await db.from('advance_deductions').delete().eq('payroll_entry_id', existing.id)
      }

      const { data: openAdv } = await db
        .from('cash_advances')
        .select('*')
        .eq('user_id', user.id)
        .gt('remaining_balance', 0)
        .order('date', { ascending: true })
      const openTotal = round2((openAdv ?? []).reduce((s, a) => s + Number(a.remaining_balance), 0))

      const grossFull = computeGross(rate.basis, Number(rate.amount), agg)
      const netBeforeAdvance = grossFull + adjustmentsTotal
      const advancesDeducted = round2(Math.min(openTotal, Math.max(0, netBeforeAdvance)))
      const carryover = round2(openTotal - advancesDeducted)
      const net = roundHalfUp(netBeforeAdvance - advancesDeducted, user.rounding_mode === 'dollar' ? 1 : 0.01)

      const { data: saved } = await db
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
            gross: round2(grossFull),
            advances_deducted: advancesDeducted,
            adjustments_total: adjustmentsTotal,
            net,
            carryover,
            rounding_mode_snapshot: user.rounding_mode,
            computed_at: new Date().toISOString(),
          },
          { onConflict: 'pay_period_id,user_id' },
        )
        .select('id')
        .single()

      let remaining = advancesDeducted
      for (const adv of openAdv ?? []) {
        if (remaining <= 0) break
        const d = round2(Math.min(Number(adv.remaining_balance), remaining))
        if (d <= 0) continue
        await db.from('advance_deductions').insert({
          cash_advance_id: adv.id,
          payroll_entry_id: saved!.id,
          amount: d,
        })
        await db
          .from('cash_advances')
          .update({ remaining_balance: round2(Number(adv.remaining_balance) - d) })
          .eq('id', adv.id)
        remaining = round2(remaining - d)
      }
      computed++
    }

    return json({ ok: true, computed })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
