import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuth } from '../context/AuthContext'
import { useRoster } from '../hooks/useAttendance'
import { useUsers } from '../hooks/useUsers'
import { hasPermission } from '../lib/types'
import { downloadCsv, timeInputValue, toCsv } from '../lib/attendance'
import RosterRow from '../components/attendance/RosterRow'
import EmployeeAttendance from '../components/attendance/EmployeeAttendance'

function todayInChicago(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
}

export default function Attendance() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'owner' || hasPermission(profile, 'manage_attendance')

  if (!profile) return null
  return canManage ? <ManagerAttendance /> : <SelfAttendance />
}

/** Employee view: own attendance for a chosen month. */
function SelfAttendance() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [month, setMonth] = useState(todayInChicago().slice(0, 7))
  if (!profile) return null

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
          {t('nav.attendance')}
        </h1>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>
      <div className="mt-6">
        <EmployeeAttendance userId={profile.id} name={profile.name} monthDate={`${month}-01`} />
      </div>
    </div>
  )
}

/** Manager/owner view: daily roster + per-employee history. */
function ManagerAttendance() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'roster' | 'history'>('roster')

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
        {t('nav.attendance')}
      </h1>
      <div className="mt-4 flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {(['roster', 'history'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={[
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
              tab === key
                ? 'border-teal-700 text-teal-800 dark:border-teal-400 dark:text-teal-300'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
            ].join(' ')}
          >
            {t(`attendance.tabs.${key}`)}
          </button>
        ))}
      </div>

      {tab === 'roster' ? <Roster /> : <History />}
    </div>
  )
}

function Roster() {
  const { t, i18n } = useTranslation()
  const [date, setDate] = useState(todayInChicago())
  const { rows, loading, error, reload } = useRoster(date)

  const markedCount = rows.filter((r) => r.attendance).length

  function exportDay() {
    const headers = [
      t('attendance.name'),
      t('attendance.date'),
      t('attendance.statusLabel'),
      t('attendance.checkIn'),
      t('attendance.checkOut'),
      t('attendance.breakMinutes'),
      t('attendance.hours'),
    ]
    const csvRows = rows
      .filter((r) => r.attendance)
      .map((r) => [
        r.user.name,
        date,
        t(`attendance.status.${r.attendance!.status}`),
        timeInputValue(r.attendance!.check_in_at),
        timeInputValue(r.attendance!.check_out_at),
        r.attendance!.break_minutes,
        r.attendance!.hours_worked ?? '',
      ])
    downloadCsv(`roster-${date}.csv`, toCsv(headers, csvRows))
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          lang={i18n.resolvedLanguage}
        />
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {t('attendance.marked', { count: markedCount, total: rows.length })}
          </span>
          {markedCount > 0 && (
            <button
              onClick={exportDay}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {t('attendance.exportCsv')}
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loading ? (
        <p className="mt-6 text-slate-500">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">{t('attendance.noEmployees')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
          {rows.map((row) => (
            <RosterRow key={row.user.id} row={row} date={date} onSaved={reload} />
          ))}
        </ul>
      )}
    </div>
  )
}

function History() {
  const { t } = useTranslation()
  const { users } = useUsers(true)
  const [userId, setUserId] = useState('')
  const [month, setMonth] = useState(todayInChicago().slice(0, 7))
  const selected = useMemo(() => users.find((u) => u.id === userId), [users, userId])

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-3">
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">{t('attendance.selectEmployee')}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>

      <div className="mt-6">
        {selected ? (
          <EmployeeAttendance
            userId={selected.id}
            name={selected.name}
            monthDate={`${month}-01`}
          />
        ) : (
          <p className="text-sm text-slate-400">{t('attendance.pickEmployeePrompt')}</p>
        )}
      </div>
    </div>
  )
}
