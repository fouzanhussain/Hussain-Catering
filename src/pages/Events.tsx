import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuth } from '../context/AuthContext'
import { useEvents } from '../hooks/useEvents'
import { hasPermission, type CateringEvent, type EventStatus } from '../lib/types'
import {
  addDays,
  addMonths,
  formatMonthYear,
  monthGrid,
  parseIso,
  shortTime,
  todayIso,
  weekDates,
  weekdayLabels,
} from '../lib/calendar'
import { formatDay } from '../lib/format'
import EventForm from '../components/events/EventForm'
import EventDetail from '../components/events/EventDetail'

type View = 'month' | 'week' | 'agenda'

const STATUS_CHIP: Record<EventStatus, string> = {
  inquiry: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  confirmed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  completed: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  cancelled: 'bg-red-100 text-red-700 line-through dark:bg-red-900/40 dark:text-red-300',
}

export default function Events() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const canManage = profile?.role === 'owner' || hasPermission(profile, 'manage_events')
  const locale = i18n.resolvedLanguage ?? 'en'

  const [view, setView] = useState<View>('agenda')
  const today = todayIso()
  const [cursor, setCursor] = useState(today) // an anchor date within the view

  // Visible date range per view.
  const { start, end, label } = useMemo(() => {
    const { y, m } = parseIso(cursor)
    if (view === 'month') {
      const grid = monthGrid(y, m)
      return { start: grid[0].date, end: grid[grid.length - 1].date, label: formatMonthYear(y, m, locale) }
    }
    if (view === 'week') {
      const days = weekDates(cursor)
      return {
        start: days[0],
        end: days[6],
        label: `${formatDay(`${days[0]}T12:00:00Z`, locale)} – ${formatDay(`${days[6]}T12:00:00Z`, locale)}`,
      }
    }
    return { start: today, end: addDays(today, 60), label: t('events.upcoming') }
  }, [view, cursor, locale, today, t])

  const { events, loading, error, reload } = useEvents(start, end)

  const [editing, setEditing] = useState<CateringEvent | null>(null)
  const [creating, setCreating] = useState<string | null>(null) // default date
  const [viewingDetail, setViewingDetail] = useState<CateringEvent | null>(null)

  function openEvent(ev: CateringEvent) {
    if (canManage) setEditing(ev)
    else setViewingDetail(ev)
  }

  function step(delta: number) {
    if (view === 'month') {
      const { y, m } = parseIso(cursor)
      const next = addMonths(y, m, delta)
      setCursor(`${next.y}-${String(next.m).padStart(2, '0')}-01`)
    } else if (view === 'week') {
      setCursor(addDays(cursor, delta * 7))
    }
  }

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{t('nav.events')}</h1>
        {canManage && (
          <button
            onClick={() => setCreating(view === 'agenda' ? today : cursor)}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
          >
            {t('events.new')}
          </button>
        )}
      </div>

      {/* View switch + navigation */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-600">
          {(['agenda', 'week', 'month'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={[
                'rounded-md px-3 py-1 text-sm font-medium',
                view === v
                  ? 'bg-teal-700 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700',
              ].join(' ')}
            >
              {t(`events.views.${v}`)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {view !== 'agenda' && (
            <>
              <button
                onClick={() => step(-1)}
                className="rounded-md border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                aria-label={t('events.prev')}
              >
                ←
              </button>
              <button
                onClick={() => setCursor(today)}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {t('events.today')}
              </button>
              <button
                onClick={() => step(1)}
                className="rounded-md border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                aria-label={t('events.next')}
              >
                →
              </button>
            </>
          )}
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-400">{t('common.loading')}</p>}

      <div className="mt-4">
        {view === 'month' && (
          <MonthView
            cursor={cursor}
            events={events}
            today={today}
            locale={locale}
            onOpen={openEvent}
            onDayClick={canManage ? (d) => setCreating(d) : undefined}
          />
        )}
        {view === 'week' && (
          <WeekView cursor={cursor} events={events} today={today} locale={locale} onOpen={openEvent} />
        )}
        {view === 'agenda' && <AgendaView events={events} locale={locale} onOpen={openEvent} />}
      </div>

      {(editing || creating) && (
        <EventForm
          event={editing}
          defaultDate={creating ?? today}
          onClose={() => {
            setEditing(null)
            setCreating(null)
          }}
          onSaved={async () => {
            setEditing(null)
            setCreating(null)
            await reload()
          }}
        />
      )}
      {viewingDetail && (
        <EventDetail event={viewingDetail} onClose={() => setViewingDetail(null)} />
      )}
    </div>
  )
}

function EventChip({ ev, onOpen }: { ev: CateringEvent; onOpen: (e: CateringEvent) => void }) {
  return (
    <button
      onClick={() => onOpen(ev)}
      className={`w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium ${STATUS_CHIP[ev.status]}`}
      title={ev.title}
    >
      {ev.start_time && <span className="tabular-nums">{shortTime(ev.start_time)} </span>}
      {ev.title}
    </button>
  )
}

function MonthView({
  cursor,
  events,
  today,
  locale,
  onOpen,
  onDayClick,
}: {
  cursor: string
  events: CateringEvent[]
  today: string
  locale: string
  onOpen: (e: CateringEvent) => void
  onDayClick?: (date: string) => void
}) {
  const { y, m } = parseIso(cursor)
  const cells = monthGrid(y, m)
  const byDay = groupByDate(events)

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <div className="grid grid-cols-7 bg-slate-50 text-center text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        {weekdayLabels(locale).map((w) => (
          <div key={w} className="py-2">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const dayEvents = byDay[cell.date] ?? []
          return (
            <div
              key={cell.date}
              className={[
                'min-h-24 border-b border-r border-slate-100 p-1 dark:border-slate-700/60',
                cell.inMonth ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/40',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <button
                  disabled={!onDayClick}
                  onClick={() => onDayClick?.(cell.date)}
                  className={[
                    'h-6 w-6 rounded-full text-xs',
                    cell.date === today ? 'bg-teal-700 font-semibold text-white' : 'text-slate-500',
                    onDayClick ? 'hover:bg-slate-100 dark:hover:bg-slate-700' : '',
                  ].join(' ')}
                >
                  {parseIso(cell.date).d}
                </button>
              </div>
              <div className="mt-0.5 space-y-0.5">
                {dayEvents.slice(0, 3).map((ev) => (
                  <EventChip key={ev.id} ev={ev} onOpen={onOpen} />
                ))}
                {dayEvents.length > 3 && (
                  <p className="px-1 text-[10px] text-slate-400">+{dayEvents.length - 3}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({
  cursor,
  events,
  today,
  locale,
  onOpen,
}: {
  cursor: string
  events: CateringEvent[]
  today: string
  locale: string
  onOpen: (e: CateringEvent) => void
}) {
  const days = weekDates(cursor)
  const byDay = groupByDate(events)

  return (
    <div className="space-y-2">
      {days.map((d) => {
        const dayEvents = byDay[d] ?? []
        return (
          <div
            key={d}
            className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
          >
            <p
              className={`text-sm font-semibold ${d === today ? 'text-teal-700 dark:text-teal-300' : 'text-slate-700 dark:text-slate-200'}`}
            >
              {formatDay(`${d}T12:00:00Z`, locale)}
            </p>
            {dayEvents.length === 0 ? (
              <p className="mt-1 text-xs text-slate-400">—</p>
            ) : (
              <div className="mt-2 space-y-1">
                {dayEvents.map((ev) => (
                  <EventChip key={ev.id} ev={ev} onOpen={onOpen} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function AgendaView({
  events,
  locale,
  onOpen,
}: {
  events: CateringEvent[]
  locale: string
  onOpen: (e: CateringEvent) => void
}) {
  const { t } = useTranslation()
  if (events.length === 0) {
    return <p className="text-sm text-slate-400">{t('events.noneUpcoming')}</p>
  }
  const groups = Object.entries(groupByDate(events)).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="space-y-4">
      {groups.map(([date, dayEvents]) => (
        <div key={date}>
          <p className="mb-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
            {formatDay(`${date}T12:00:00Z`, locale)}
          </p>
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
            {dayEvents.map((ev) => (
              <li key={ev.id}>
                <button
                  onClick={() => onOpen(ev)}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                      {ev.title}
                    </p>
                    <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                      {ev.start_time && `${shortTime(ev.start_time)} · `}
                      {ev.venue ?? ev.client_name ?? ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${STATUS_CHIP[ev.status]}`}
                  >
                    {t(`events.statuses.${ev.status}`)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function groupByDate(events: CateringEvent[]): Record<string, CateringEvent[]> {
  const map: Record<string, CateringEvent[]> = {}
  for (const ev of events) (map[ev.date] ??= []).push(ev)
  return map
}
