// Attendance helpers: converting between Chicago wall-clock time entered by a
// manager and the UTC timestamps we store, plus CSV export.
import type { Attendance } from './types'

const TZ = 'America/Chicago'

/** Offset (tz − UTC) in ms for the given instant, via Intl. */
function tzOffsetMs(date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const p = dtf.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    acc[part.type] = part.value
    return acc
  }, {})
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  )
  return asUtc - date.getTime()
}

/** Convert a Chicago wall-clock date + time to a UTC ISO instant. */
function zonedToUtcIso(year: number, month0: number, day: number, h: number, m: number): string {
  const utcGuess = Date.UTC(year, month0, day, h, m)
  const offset = tzOffsetMs(new Date(utcGuess))
  return new Date(utcGuess - offset).toISOString()
}

/** "HH:MM" (24h) as displayed in Chicago for a stored ISO timestamp. */
export function timeInputValue(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}

/**
 * Build check-in/out timestamps from an attendance date and two "HH:MM" times.
 * If checkout is at or before check-in, it rolls to the next day (overnight).
 */
export function buildClockTimestamps(
  date: string,
  inTime: string,
  outTime: string,
): { check_in_at: string | null; check_out_at: string | null } {
  if (!inTime || !outTime) return { check_in_at: null, check_out_at: null }
  const [y, mo, d] = date.split('-').map(Number)
  const [ih, im] = inTime.split(':').map(Number)
  const [oh, om] = outTime.split(':').map(Number)

  const check_in_at = zonedToUtcIso(y, mo - 1, d, ih, im)
  const overnight = oh * 60 + om <= ih * 60 + im
  const check_out_at = zonedToUtcIso(y, mo - 1, d + (overnight ? 1 : 0), oh, om)
  return { check_in_at, check_out_at }
}

/** Inclusive first/last day (YYYY-MM-DD) of the month containing `date`. */
export function monthRange(date: string): { start: string; end: string } {
  const [y, mo] = date.split('-').map(Number)
  const start = `${y}-${String(mo).padStart(2, '0')}-01`
  const lastDay = new Date(y, mo, 0).getDate()
  const end = `${y}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

/** Statuses that count as a worked/creditable day for the day tally. */
export function isCreditedDay(status: Attendance['status']): boolean {
  return status === 'present' || status === 'excused_paid' || status === 'half_day'
}

// --- CSV export -----------------------------------------------------------

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(csvCell).join(',')]
  for (const row of rows) lines.push(row.map(csvCell).join(','))
  return lines.join('\n')
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
