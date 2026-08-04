// Pure calendar-date helpers (no timezone math — events are date-only).
// All dates are YYYY-MM-DD strings and computed in UTC to avoid DST drift.

export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function parseIso(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}

/** Shift a YYYY-MM by `delta` months, returning { y, m } (m is 1-12). */
export function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const total = (y * 12 + (m - 1)) + delta
  return { y: Math.floor(total / 12), m: (total % 12) + 1 }
}

export function addDays(dateIso: string, delta: number): string {
  const { y, m, d } = parseIso(dateIso)
  return iso(new Date(Date.UTC(y, m - 1, d + delta)))
}

/** 6×7 grid of dates covering the month, with leading/trailing days. */
export function monthGrid(y: number, m: number): { date: string; inMonth: boolean }[] {
  const first = new Date(Date.UTC(y, m - 1, 1))
  const startDow = first.getUTCDay() // 0 = Sunday
  const cells: { date: string; inMonth: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const day = new Date(Date.UTC(y, m - 1, 1 - startDow + i))
    cells.push({ date: iso(day), inMonth: day.getUTCMonth() === m - 1 })
  }
  return cells
}

/** The seven dates (Sun–Sat) of the week containing `dateIso`. */
export function weekDates(dateIso: string): string[] {
  const { y, m, d } = parseIso(dateIso)
  const base = new Date(Date.UTC(y, m - 1, d))
  const start = d - base.getUTCDay()
  return Array.from({ length: 7 }, (_, i) => iso(new Date(Date.UTC(y, m - 1, start + i))))
}

export function monthBounds(y: number, m: number): { start: string; end: string } {
  const start = iso(new Date(Date.UTC(y, m - 1, 1)))
  const end = iso(new Date(Date.UTC(y, m, 0)))
  return { start, end }
}

export function formatMonthYear(y: number, m: number, locale: string): string {
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function weekdayLabels(locale: string): string[] {
  // A known Sunday (2024-01-07) → localized short weekday names, Sun-first.
  return Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2024, 0, 7 + i)).toLocaleDateString(locale, {
      weekday: 'short',
      timeZone: 'UTC',
    }),
  )
}

export function dayOfMonth(dateIso: string): number {
  return parseIso(dateIso).d
}

/** "HH:MM" from a stored time value like "18:30" or "18:30:00". */
export function shortTime(t: string | null): string {
  return t ? t.slice(0, 5) : ''
}
