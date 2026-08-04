import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getEventStaffIds } from '../../lib/api'
import { useUsers } from '../../hooks/useUsers'
import { shortTime } from '../../lib/calendar'
import type { CateringEvent } from '../../lib/types'

/** Read-only event view for staff who can't manage events. */
export default function EventDetail({
  event,
  onClose,
}: {
  event: CateringEvent
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { users } = useUsers(true)
  const [staffIds, setStaffIds] = useState<string[]>([])

  useEffect(() => {
    void getEventStaffIds(event.id).then(setStaffIds)
  }, [event.id])

  const staffNames = staffIds
    .map((id) => users.find((u) => u.id === id)?.name)
    .filter(Boolean)
    .join(', ')

  const rows: [string, string | null][] = [
    [t('events.date'), event.date],
    [
      t('events.time'),
      event.start_time
        ? `${shortTime(event.start_time)}${event.end_time ? `–${shortTime(event.end_time)}` : ''}`
        : null,
    ],
    [t('events.venue'), event.venue],
    [t('events.clientName'), event.client_name],
    [t('events.clientPhone'), event.client_phone],
    [t('events.headcount'), event.headcount != null ? String(event.headcount) : null],
    [t('events.status'), t(`events.statuses.${event.status}`)],
    [t('events.assignedStaff'), staffNames || null],
    [t('events.notes'), event.notes],
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl dark:bg-slate-800 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{event.title}</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            {t('common.close')}
          </button>
        </div>
        <dl className="mt-4 space-y-2">
          {rows
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <div key={label} className="flex gap-3">
                <dt className="w-28 shrink-0 text-sm font-medium text-slate-500 dark:text-slate-400">
                  {label}
                </dt>
                <dd className="text-sm text-slate-800 dark:text-slate-100">{value}</dd>
              </div>
            ))}
        </dl>
      </div>
    </div>
  )
}
