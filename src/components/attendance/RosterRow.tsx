import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { upsertAttendance } from '../../lib/api'
import { buildClockTimestamps, timeInputValue } from '../../lib/attendance'
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '../../lib/types'
import type { RosterRow as Row } from '../../hooks/useAttendance'

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-600 text-white',
  absent: 'bg-red-600 text-white',
  half_day: 'bg-amber-500 text-white',
  excused_paid: 'bg-sky-600 text-white',
  excused_unpaid: 'bg-slate-500 text-white',
}

export default function RosterRow({
  row,
  date,
  onSaved,
}: {
  row: Row
  date: string
  onSaved: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const { user, attendance } = row
  const isHourly = user.pay_basis === 'hourly'
  const locked = attendance?.locked ?? false

  const [status, setStatus] = useState<AttendanceStatus | null>(attendance?.status ?? null)
  const [inTime, setInTime] = useState(timeInputValue(attendance?.check_in_at ?? null))
  const [outTime, setOutTime] = useState(timeInputValue(attendance?.check_out_at ?? null))
  const [breakMin, setBreakMin] = useState(String(attendance?.break_minutes ?? 0))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const showTimes = isHourly && status === 'present'

  async function save() {
    if (!status) return
    setError(null)
    if (showTimes && (!inTime || !outTime)) {
      setError(t('attendance.errors.timesRequired'))
      return
    }
    setBusy(true)
    try {
      const clock = showTimes
        ? buildClockTimestamps(date, inTime, outTime)
        : { check_in_at: null, check_out_at: null }
      await upsertAttendance({
        user_id: user.id,
        date,
        status,
        check_in_at: clock.check_in_at,
        check_out_at: clock.check_out_at,
        break_minutes: showTimes ? Number(breakMin) || 0 : 0,
        edit_reason: attendance ? reason.trim() || null : null,
      })
      setSaved(true)
      setReason('')
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const dirty =
    status !== (attendance?.status ?? null) ||
    (showTimes &&
      (inTime !== timeInputValue(attendance?.check_in_at ?? null) ||
        outTime !== timeInputValue(attendance?.check_out_at ?? null) ||
        Number(breakMin) !== (attendance?.break_minutes ?? 0)))

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
            <span className="truncate">{user.name}</span>
            {isHourly && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                {t('payBasis.hourly')}
              </span>
            )}
            {locked && (
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-white">
                🔒 {t('attendance.locked')}
              </span>
            )}
          </p>
          {attendance?.hours_worked != null && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('attendance.hours')}: {attendance.hours_worked}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ATTENDANCE_STATUSES.map((s) => {
            const active = status === s
            return (
              <button
                key={s}
                disabled={locked}
                onClick={() => {
                  setStatus(s)
                  setSaved(false)
                }}
                className={[
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                  active
                    ? STATUS_STYLES[s]
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600',
                ].join(' ')}
              >
                {t(`attendance.status.${s}`)}
              </button>
            )
          })}
        </div>
      </div>

      {showTimes && !locked && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-500 dark:text-slate-400">
            {t('attendance.checkIn')}
            <input
              type="time"
              value={inTime}
              onChange={(e) => setInTime(e.target.value)}
              className="mt-0.5 block rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-500 dark:text-slate-400">
            {t('attendance.checkOut')}
            <input
              type="time"
              value={outTime}
              onChange={(e) => setOutTime(e.target.value)}
              className="mt-0.5 block rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-500 dark:text-slate-400">
            {t('attendance.breakMinutes')}
            <input
              type="number"
              min={0}
              value={breakMin}
              onChange={(e) => setBreakMin(e.target.value)}
              className="mt-0.5 block w-20 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
        </div>
      )}

      {attendance && !locked && dirty && (
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('attendance.editReason')}
          className="mt-3 w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
      )}

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!locked && (
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => void save()}
            disabled={busy || !status || !dirty}
            className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-40"
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
          {saved && !dirty && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">
              ✓ {t('attendance.saved')}
            </span>
          )}
        </div>
      )}
    </li>
  )
}
