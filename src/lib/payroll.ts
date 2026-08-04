// ============================================================================
// Payroll computation core (Phase 4).
// ============================================================================
// Pure, dependency-free, and exhaustively unit-tested (scripts/test-payroll.ts).
// Money is treated at full precision through every intermediate step; rounding
// is applied ONCE to the final net, per the employee's rounding mode (spec
// §4.5.4). The Edge Function and the owner-side compute both use this module so
// the numbers can never drift between them.

import type { PayGroup, RoundingMode, SalaryBasis } from './types'

/** Expected workdays per period for salaried staff (owner decision #4). */
export const EXPECTED_WORKDAYS = 13

/** Round to 2 decimals, clearing binary-float artifacts. */
export function round2(x: number): number {
  return Number(x.toFixed(2))
}

/**
 * Round half-up to the nearest `step` (0.01 for cents, 1 for dollars).
 * A relative epsilon absorbs float under-representation of exact halves
 * (e.g. 10.005 stored as 10.00499999…) so boundaries round up as intended.
 */
export function roundHalfUp(value: number, step: number): number {
  const q = value / step
  const eps = 1e-9 * Math.max(1, Math.abs(q))
  const n = q >= 0 ? Math.floor(q + 0.5 + eps) : Math.ceil(q - 0.5 - eps)
  return round2(n * step)
}

export function roundStepFor(mode: RoundingMode): number {
  return mode === 'dollar' ? 1 : 0.01
}

export interface ComputeInput {
  basis: SalaryBasis
  /** Day rate, hourly rate, or salary-per-period depending on basis. */
  rate: number
  presentDays: number
  halfDays: number
  absentDays: number
  excusedPaid: number
  excusedUnpaid: number
  totalHours: number
  rounding: RoundingMode
  /** Total outstanding advance balance to apply this period. */
  openAdvance: number
  /** Sum of manual adjustment line items (may be negative). */
  adjustmentsTotal: number
  expectedWorkdays?: number
}

export interface ComputeResult {
  gross: number
  adjustmentsTotal: number
  advancesDeducted: number
  /** Advance balance that could not be covered and rolls to the next period. */
  carryover: number
  net: number
}

/** Gross for a period, at full precision (spec §4.5.1). */
export function computeGross(input: ComputeInput): number {
  const { basis, rate } = input
  const expected = input.expectedWorkdays ?? EXPECTED_WORKDAYS
  switch (basis) {
    case 'per_day':
      return rate * (input.presentDays + input.excusedPaid + 0.5 * input.halfDays)
    case 'hourly':
      return rate * input.totalHours
    case 'semi_monthly_salary': {
      const dailyValue = rate / expected
      return (
        rate -
        dailyValue * (input.absentDays + input.excusedUnpaid) -
        0.5 * dailyValue * input.halfDays
      )
    }
  }
}

/**
 * Full period computation: gross → +adjustments → −advances (with carryover)
 * → round net once. Advances only draw against a non-negative balance; the
 * uncovered remainder rolls forward (spec §4.5.3).
 */
export function computeEntry(input: ComputeInput): ComputeResult {
  const grossFull = computeGross(input)
  const netBeforeAdvance = grossFull + input.adjustmentsTotal

  const available = Math.max(0, netBeforeAdvance)
  const advancesDeducted = Math.min(input.openAdvance, available)
  const carryover = input.openAdvance - advancesDeducted

  const netFull = netBeforeAdvance - advancesDeducted
  const net = roundHalfUp(netFull, roundStepFor(input.rounding))

  return {
    gross: round2(grossFull),
    adjustmentsTotal: round2(input.adjustmentsTotal),
    advancesDeducted: round2(advancesDeducted),
    carryover: round2(carryover),
    net,
  }
}

// ============================================================================
// Period generation — two parallel tracks, one per pay group (spec §4.5.2).
// ============================================================================

export interface PeriodSpec {
  pay_group: PayGroup
  start_date: string // YYYY-MM-DD
  end_date: string
  payout_date: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`
}
function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
function nextMonth(y: number, m: number): { y: number; m: number } {
  return m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 }
}
function prevMonth(y: number, m: number): { y: number; m: number } {
  return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }
}

/** The period (within the group's track) that contains `dateIso`. */
export function periodForDate(group: PayGroup, dateIso: string): PeriodSpec {
  const [y, m, d] = dateIso.split('-').map(Number)

  if (group === 'group_1_15') {
    if (d <= 15) {
      return { pay_group: group, start_date: ymd(y, m, 1), end_date: ymd(y, m, 15), payout_date: ymd(y, m, 15) }
    }
    const nm = nextMonth(y, m)
    return {
      pay_group: group,
      start_date: ymd(y, m, 16),
      end_date: ymd(y, m, lastDayOfMonth(y, m)),
      payout_date: ymd(nm.y, nm.m, 1),
    }
  }

  // group_5_20
  if (d >= 5 && d <= 20) {
    return { pay_group: group, start_date: ymd(y, m, 5), end_date: ymd(y, m, 20), payout_date: ymd(y, m, 20) }
  }
  if (d >= 21) {
    const nm = nextMonth(y, m)
    return {
      pay_group: group,
      start_date: ymd(y, m, 21),
      end_date: ymd(nm.y, nm.m, 4),
      payout_date: ymd(nm.y, nm.m, 5),
    }
  }
  // d <= 4 → belongs to the previous month's 21st→4th period
  const pm = prevMonth(y, m)
  return {
    pay_group: group,
    start_date: ymd(pm.y, pm.m, 21),
    end_date: ymd(y, m, 4),
    payout_date: ymd(y, m, 5),
  }
}

/** All periods whose start_date falls in `year`, sorted ascending. */
export function enumeratePeriods(group: PayGroup, year: number): PeriodSpec[] {
  const out: PeriodSpec[] = []
  for (let m = 1; m <= 12; m++) {
    if (group === 'group_1_15') {
      out.push(periodForDate(group, ymd(year, m, 1)))
      out.push(periodForDate(group, ymd(year, m, 16)))
    } else {
      out.push(periodForDate(group, ymd(year, m, 5)))
      out.push(periodForDate(group, ymd(year, m, 21)))
    }
  }
  return out.sort((a, b) => a.start_date.localeCompare(b.start_date))
}
