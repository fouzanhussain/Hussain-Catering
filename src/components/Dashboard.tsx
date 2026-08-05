import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import {
  listAttendanceByDate,
  listEvents,
  listUsers,
} from '../lib/api'
import { listPayments } from '../lib/vendorApi'
import { listAdvances, listPeriods } from '../lib/payrollApi'
import { listCashEntries, listInventory } from '../lib/opsApi'
import { effectivePaymentStatus, type PayGroup, type PayPeriod } from '../lib/types'
import { periodForDate } from '../lib/payroll'
import { todayIso, addDays } from '../lib/calendar'
import { formatMoney, formatDay } from '../lib/format'

interface Data {
  activeUsers: number
  markedToday: number
  todayEvents: { id: string; title: string; start_time: string | null }[]
  weekEventCount: number
  dueThisWeek: number
  overdue: number
  cashInTransit: number
  pendingInventory: number
  unacknowledgedAdvances: number
  periods: PayPeriod[]
}

export default function Dashboard() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? 'en'
  const today = todayIso()
  const weekEnd = addDays(today, 7)
  const [data, setData] = useState<Data | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      const [users, att, todayEv, weekEv, payments, cash, inv, advances, periods] =
        await Promise.all([
          listUsers(false).catch(() => []),
          listAttendanceByDate(today).catch(() => []),
          listEvents(today, today).catch(() => []),
          listEvents(today, weekEnd).catch(() => []),
          listPayments({}).catch(() => []),
          listCashEntries().catch(() => []),
          listInventory().catch(() => []),
          listAdvances().catch(() => []),
          listPeriods().catch(() => []),
        ])
      if (!active) return
      setData({
        activeUsers: users.length,
        markedToday: new Set(att.map((a) => a.user_id)).size,
        todayEvents: todayEv.map((e) => ({ id: e.id, title: e.title, start_time: e.start_time })),
        weekEventCount: weekEv.length,
        dueThisWeek: payments.filter(
          (p) => p.status === 'scheduled' && p.due_date >= today && p.due_date <= weekEnd,
        ).length,
        overdue: payments.filter((p) => effectivePaymentStatus(p, today) === 'overdue').length,
        cashInTransit: cash.filter((c) => c.status !== 'deposited').reduce((s, c) => s + Number(c.amount), 0),
        pendingInventory: inv.filter((r) => ['requested', 'approved', 'purchased'].includes(r.status)).length,
        unacknowledgedAdvances: advances.filter((a) => !a.acknowledged_at).length,
        periods,
      })
    }
    void load()
    return () => {
      active = false
    }
  }, [today, weekEnd])

  if (!data) {
    return <p className="text-sm text-slate-400">{t('common.loading')}</p>
  }

  function currentPeriod(group: PayGroup): PayPeriod | null {
    const spec = periodForDate(group, today)
    return data!.periods.find((p) => p.pay_group === group && p.start_date === spec.start_date) ?? null
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat
          to="/attendance"
          label={t('dashboard.rosterMarked')}
          value={`${data.markedToday}/${data.activeUsers}`}
          tone={data.markedToday >= data.activeUsers && data.activeUsers > 0 ? 'good' : 'warn'}
        />
        <Stat to="/events" label={t('dashboard.eventsThisWeek')} value={data.weekEventCount} />
        <Stat
          to="/vendors"
          label={t('dashboard.overdue')}
          value={data.overdue}
          tone={data.overdue > 0 ? 'bad' : 'neutral'}
        />
        <Stat to="/vendors" label={t('dashboard.dueThisWeek')} value={data.dueThisWeek} />
        <Stat to="/cash" label={t('dashboard.cashInTransit')} value={formatMoney(data.cashInTransit, locale)} />
        <Stat
          to="/inventory"
          label={t('dashboard.pendingInventory')}
          value={data.pendingInventory}
          tone={data.pendingInventory > 0 ? 'warn' : 'neutral'}
        />
        <Stat
          to="/advances"
          label={t('dashboard.unackAdvances')}
          value={data.unacknowledgedAdvances}
          tone={data.unacknowledgedAdvances > 0 ? 'warn' : 'neutral'}
        />
      </div>

      {/* Payroll tracks */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(['group_1_15', 'group_5_20'] as const).map((g) => {
          const p = currentPeriod(g)
          return (
            <Link
              key={g}
              to="/payroll"
              className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
            >
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {t(`payGroup.${g}`)}
              </p>
              {p ? (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {t(`payroll.statuses.${p.status}`)} · {t('payroll.payout')} {p.payout_date}
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-400">{t('dashboard.noPeriod')}</p>
              )}
            </Link>
          )
        })}
      </div>

      {/* Today's events */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {t('dashboard.todayEvents')} · {formatDay(`${today}T12:00:00Z`, locale)}
        </p>
        {data.todayEvents.length === 0 ? (
          <p className="mt-1 text-sm text-slate-400">{t('dashboard.noEventsToday')}</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {data.todayEvents.map((e) => (
              <li key={e.id} className="text-sm text-slate-600 dark:text-slate-300">
                {e.start_time ? `${e.start_time.slice(0, 5)} · ` : ''}
                {e.title}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  to,
  tone = 'neutral',
}: {
  label: string
  value: string | number
  to: string
  tone?: 'neutral' | 'good' | 'warn' | 'bad'
}) {
  const toneClass = {
    neutral: 'text-slate-900 dark:text-slate-50',
    good: 'text-emerald-700 dark:text-emerald-400',
    warn: 'text-amber-700 dark:text-amber-400',
    bad: 'text-red-700 dark:text-red-400',
  }[tone]
  return (
    <Link
      to={to}
      className="rounded-xl border border-slate-200 bg-white p-3 transition-shadow hover:shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </Link>
  )
}
