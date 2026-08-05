// Exact-number tests for the payroll core (spec §4.5 mandate: "assert exact
// expected numbers before trusting it with real pay"). Run:
//   node --experimental-strip-types scripts/test-payroll.ts
import {
  computeEntry,
  enumeratePeriods,
  periodForDate,
  type ComputeInput,
} from '../src/lib/payroll.ts'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log(`  ✓ ${name}`)
  } else {
    failures++
    console.error(`  ✗ ${name}\n      expected ${e}\n      got      ${a}`)
  }
}

const base = {
  presentDays: 0,
  halfDays: 0,
  absentDays: 0,
  excusedPaid: 0,
  excusedUnpaid: 0,
  totalHours: 0,
  openAdvance: 0,
  adjustmentsTotal: 0,
} satisfies Partial<ComputeInput>

console.log('Gross by basis × rounding:')

// per_day, cent, no advance: 100 × (10 + 2 + 0.5) = 1250
check('per_day cent net', computeEntry({
  ...base, basis: 'per_day', rate: 100, rounding: 'cent',
  presentDays: 10, excusedPaid: 2, halfDays: 1,
}).net, 1250)

// hourly, cent: 15.25 × 37.5 = 571.875 → 571.88
check('hourly cent net (round boundary)', computeEntry({
  ...base, basis: 'hourly', rate: 15.25, rounding: 'cent', totalHours: 37.5,
}).net, 571.88)

// semi-monthly salary, dollar: 2000 − 2.5 × (2000/13) = 1615.3846… → 1615
check('semi_monthly dollar net', computeEntry({
  ...base, basis: 'semi_monthly_salary', rate: 2000, rounding: 'dollar',
  absentDays: 1, excusedUnpaid: 1, halfDays: 1,
}).net, 1615)

console.log('\nAdvances (deduction, carryover, exceeds-net):')

// advance exceeds net: gross 500, advance 700 → net 0, deducted 500, carryover 200
{
  const r = computeEntry({
    ...base, basis: 'per_day', rate: 100, rounding: 'cent', presentDays: 5, openAdvance: 700,
  })
  check('advance>net → net', r.net, 0)
  check('advance>net → deducted', r.advancesDeducted, 500)
  check('advance>net → carryover', r.carryover, 200)
}

// adjustments + partial advance: 800 + 20 − 100 = 720 (dollar)
{
  const r = computeEntry({
    ...base, basis: 'hourly', rate: 20, rounding: 'dollar', totalHours: 40,
    adjustmentsTotal: 20, openAdvance: 100,
  })
  check('adjust+advance → net', r.net, 720)
  check('adjust+advance → deducted', r.advancesDeducted, 100)
  check('adjust+advance → carryover', r.carryover, 0)
}

console.log('\nRounding boundaries (half-up, applied once):')

// 100.50 → dollar → 101
check('dollar half-up 100.50 → 101', computeEntry({
  ...base, basis: 'per_day', rate: 100.5, rounding: 'dollar', presentDays: 1,
}).net, 101)

// 10.005 → cent → 10.01 (float under-representation guard)
check('cent half-up 10.005 → 10.01', computeEntry({
  ...base, basis: 'per_day', rate: 10.005, rounding: 'cent', presentDays: 1,
}).net, 10.01)

console.log('\nPeriod generation (dual tracks):')

check('1_15 first half', periodForDate('group_1_15', '2026-08-04'), {
  pay_group: 'group_1_15', start_date: '2026-08-01', end_date: '2026-08-15', payout_date: '2026-08-15',
})
check('1_15 second half → paid 1st next month', periodForDate('group_1_15', '2026-08-20'), {
  pay_group: 'group_1_15', start_date: '2026-08-16', end_date: '2026-08-31', payout_date: '2026-09-01',
})
check('1_15 Feb leap-year end', periodForDate('group_1_15', '2024-02-20'), {
  pay_group: 'group_1_15', start_date: '2024-02-16', end_date: '2024-02-29', payout_date: '2024-03-01',
})
check('5_20 first half', periodForDate('group_5_20', '2026-08-10'), {
  pay_group: 'group_5_20', start_date: '2026-08-05', end_date: '2026-08-20', payout_date: '2026-08-20',
})
check('5_20 21→4 spans month', periodForDate('group_5_20', '2026-08-25'), {
  pay_group: 'group_5_20', start_date: '2026-08-21', end_date: '2026-09-04', payout_date: '2026-09-05',
})
check('5_20 early-month belongs to prev period', periodForDate('group_5_20', '2026-08-02'), {
  pay_group: 'group_5_20', start_date: '2026-07-21', end_date: '2026-08-04', payout_date: '2026-08-05',
})
check('5_20 Dec→Jan year wrap', periodForDate('group_5_20', '2026-12-25'), {
  pay_group: 'group_5_20', start_date: '2026-12-21', end_date: '2027-01-04', payout_date: '2027-01-05',
})
check('1_15 enumerate count', enumeratePeriods('group_1_15', 2026).length, 24)
check('1_15 enumerate first', enumeratePeriods('group_1_15', 2026)[0].start_date, '2026-01-01')

console.log('')
if (failures > 0) {
  console.error(`FAILED: ${failures} assertion(s)`)
  process.exit(1)
}
console.log('All payroll assertions passed.')
