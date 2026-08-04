// Timestamps are stored UTC and displayed in America/Chicago (NFR §8).
const TZ = 'America/Chicago'

export function formatTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TZ,
  })
}

export function formatDay(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: TZ,
  })
}

/** Day key (in Chicago tz) used to group messages under date separators. */
export function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
}
