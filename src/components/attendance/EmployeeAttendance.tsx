import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useUserAttendance } from '../../hooks/useAttendance'
import { downloadCsv, isCreditedDay, monthRange, timeInputValue, toCsv } from '../../lib/attendance'
import { formatDay } from '../../lib/format'

/**
 * A person's attendance for the month containing `monthDate`, with day/hours
 * totals and CSV export. No pay amounts are shown (spec §4.2).
 */
export default function EmployeeAttendance({
  userId,
  name,
  monthDate,
}: {
  userId: string
  name: string
  monthDate: string
}) {
  const { t, i18n } = useTranslation()
  const { start, end } = useMemo(() => monthRange(monthDate), [monthDate])
  const { records, loading, error } = useUserAttendance(userId, start, end)
  const locale = i18n.resolvedLanguage ?? 'en'

  const totals = useMemo(() => {
    let days = 0
    let hours = 0
    for (const r of records) {
      if (isCreditedDay(r.status)) days += r.status === 'half_day' ? 0.5 : 1
      if (r.hours_worked != null) hours += Number(r.hours_worked)
    }
    return { days, hours: Math.round(hours * 100) / 100 }
  }, [records])

  function exportCsv() {
    const headers = [
      t('attendance.name'),
      t('attendance.date'),
      t('attendance.statusLabel'),
      t('attendance.checkIn'),
      t('attendance.checkOut'),
      t('attendance.breakMinutes'),
      t('attendance.hours'),
    ]
    const rows = records.map((r) => [
      name,
      r.date,
      t(`attendance.status.${r.status}`),
      timeInputValue(r.check_in_at),
      timeInputValue(r.check_out_at),
      r.break_minutes,
      r.hours_worked ?? '',
    ])
    downloadCsv(`attendance-${name}-${start}.csv`, toCsv(headers, rows))
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-4">
          <Stat label={t('attendance.daysCredited')} value={totals.days} />
          <Stat label={t('attendance.hoursThisMonth')} value={totals.hours} />
        </div>
        {records.length > 0 && (
          <button
            onClick={exportCsv}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {t('attendance.exportCsv')}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loading ? (
        <p className="mt-4 text-slate-500">{t('common.loading')}</p>
      ) : records.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">{t('attendance.noRecords')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
          {records.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 p-3">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {formatDay(`${r.date}T12:00:00Z`, locale)}
                </p>
                {r.check_in_at && r.check_out_at && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {timeInputValue(r.check_in_at)}–{timeInputValue(r.check_out_at)}
                    {r.break_minutes > 0 && ` · ${r.break_minutes}m ${t('attendance.break')}`}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  {t(`attendance.status.${r.status}`)}
                </p>
                {r.hours_worked != null && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {r.hours_worked} {t('attendance.hoursShort')}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">
      <p className="text-xl font-bold text-slate-900 dark:text-slate-50">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  )
}
