import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuth } from '../context/AuthContext'
import { useUsers } from '../hooks/useUsers'
import {
  addAdjustment,
  addSalaryRate,
  computePeriod,
  deleteAdjustment,
  ensurePeriod,
  listAdjustments,
  listEntries,
  listMyEntries,
  listPeriods,
  listRatesForUser,
  markPeriodPaid,
  setPeriodStatus,
} from '../lib/payrollApi'
import { enumeratePeriods } from '../lib/payroll'
import {
  hasPermission,
  type PayPeriod,
  type PayPeriodStatus,
  type PayrollAdjustment,
  type PayrollEntry,
  type SalaryBasis,
  type SalaryRate,
  type UserProfile,
} from '../lib/types'
import { formatMoney } from '../lib/format'
import { downloadCsv, toCsv } from '../lib/attendance'
import { todayIso } from '../lib/calendar'
import Payslip from '../components/payroll/Payslip'

export default function Payroll() {
  const { profile } = useAuth()
  const canView = profile?.role === 'owner' || hasPermission(profile, 'view_payroll')
  if (!profile) return null
  return canView ? <PayrollAdmin /> : <MyPayslips userId={profile.id} />
}

const STATUS_BADGE: Record<PayPeriodStatus, string> = {
  open: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  review: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  locked: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
}

// --- Employee payslips ----------------------------------------------------

function MyPayslips({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<PayrollEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void listMyEntries(userId)
      .then(setEntries)
      .finally(() => setLoading(false))
  }, [userId])

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{t('nav.payroll')}</h1>
      {loading ? (
        <p className="mt-6 text-slate-500">{t('common.loading')}</p>
      ) : entries.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">{t('payroll.noPayslips')}</p>
      ) : (
        <div className="mt-6 space-y-3">
          {entries.map((e) => (
            <div
              key={e.id}
              className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
            >
              <Payslip entry={e} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Owner admin ----------------------------------------------------------

function PayrollAdmin() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'periods' | 'rates'>('periods')

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{t('nav.payroll')}</h1>
      <div className="mt-4 flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {(['periods', 'rates'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={[
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
              tab === k
                ? 'border-teal-700 text-teal-800 dark:border-teal-400 dark:text-teal-300'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400',
            ].join(' ')}
          >
            {t(`payroll.tabs.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'periods' ? <PeriodsTab /> : <RatesTab />}
    </div>
  )
}

function PeriodsTab() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [periods, setPeriods] = useState<PayPeriod[]>([])
  const [year, setYear] = useState(Number(todayIso().slice(0, 4)))
  const [selected, setSelected] = useState<PayPeriod | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const list = await listPeriods()
      setPeriods(list)
      setSelected((prev) => (prev ? list.find((p) => p.id === prev.id) ?? null : null))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      for (const group of ['group_1_15', 'group_5_20'] as const) {
        for (const spec of enumeratePeriods(group, year)) await ensurePeriod(spec)
      }
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const byGroup = (g: string) => periods.filter((p) => p.pay_group === g)

  if (selected) {
    return (
      <PeriodReview
        period={selected}
        actorId={profile!.id}
        onBack={() => setSelected(null)}
        onChanged={reload}
      />
    )
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
        <button
          onClick={() => void generate()}
          disabled={busy}
          className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {busy ? t('common.saving') : t('payroll.generatePeriods')}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {(['group_1_15', 'group_5_20'] as const).map((g) => (
          <div key={g}>
            <h2 className="mb-2 font-semibold text-slate-800 dark:text-slate-100">
              {t(`payGroup.${g}`)}
            </h2>
            <ul className="space-y-1.5">
              {byGroup(g).length === 0 && (
                <p className="text-sm text-slate-400">{t('payroll.noPeriods')}</p>
              )}
              {byGroup(g).map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setSelected(p)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700/50"
                  >
                    <span className="text-slate-700 dark:text-slate-200">
                      {p.start_date} → {p.end_date}
                    </span>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[p.status]}`}>
                      {t(`payroll.statuses.${p.status}`)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function PeriodReview({
  period,
  actorId,
  onBack,
  onChanged,
}: {
  period: PayPeriod
  actorId: string
  onBack: () => void
  onChanged: () => void | Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? 'en'
  const { users } = useUsers(true)
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users])
  const [entries, setEntries] = useState<PayrollEntry[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editable = period.status === 'open' || period.status === 'review'

  const reloadEntries = useCallback(async () => {
    setEntries(await listEntries(period.id))
  }, [period.id])

  useEffect(() => {
    void reloadEntries()
  }, [reloadEntries])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await reloadEntries()
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function exportCsv() {
    const headers = [
      t('advances.name'),
      t('payroll.gross'),
      t('payroll.adjustments'),
      t('payroll.advancesDeducted'),
      t('payroll.net'),
      t('payroll.carryover'),
    ]
    const rows = entries.map((e) => [
      userMap.get(e.user_id) ?? e.user_id,
      e.gross,
      e.adjustments_total,
      e.advances_deducted,
      e.net,
      e.carryover,
    ])
    downloadCsv(`payroll-${period.pay_group}-${period.start_date}.csv`, toCsv(headers, rows))
  }

  const total = entries.reduce((s, e) => s + Number(e.net), 0)

  return (
    <div className="mt-4">
      <button onClick={onBack} className="text-sm text-teal-700 hover:underline dark:text-teal-300">
        ← {t('common.back')}
      </button>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">
            {period.start_date} → {period.end_date}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t(`payGroup.${period.pay_group}`)} · {t('payroll.payout')} {period.payout_date} ·{' '}
            <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_BADGE[period.status]}`}>
              {t(`payroll.statuses.${period.status}`)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <button
              onClick={() => void run(() => computePeriod(period, actorId))}
              disabled={busy}
              className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {t('payroll.compute')}
            </button>
          )}
          {period.status === 'open' && (
            <button
              onClick={() => void run(async () => {
                await computePeriod(period, actorId)
                await setPeriodStatus(period, 'review', actorId)
              })}
              disabled={busy}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {t('payroll.moveToReview')}
            </button>
          )}
          {period.status === 'review' && (
            <button
              onClick={() => {
                if (confirm(t('payroll.confirmLock'))) void run(() => setPeriodStatus(period, 'locked', actorId))
              }}
              disabled={busy}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {t('payroll.lock')}
            </button>
          )}
          {period.status === 'locked' && <MarkPaidButton period={period} actorId={actorId} onDone={() => void run(async () => {})} />}
          {entries.length > 0 && (
            <button
              onClick={exportCsv}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {t('attendance.exportCsv')}
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {entries.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">{t('payroll.notComputed')}</p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
            {entries.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40"
                >
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {userMap.get(e.user_id) ?? '—'}
                  </span>
                  <span className="tabular-nums font-semibold text-slate-900 dark:text-slate-50">
                    {formatMoney(e.net, locale)}
                  </span>
                </button>
                {expanded === e.id && (
                  <div className="border-t border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                    <Payslip entry={e} period={period} />
                    {editable && (
                      <AdjustmentsEditor
                        entry={e}
                        actorId={actorId}
                        onChanged={() => void run(() => computePeriod(period, actorId))}
                      />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-right text-sm font-semibold text-slate-800 dark:text-slate-100">
            {t('payroll.totalNet')}: {formatMoney(total, locale)}
          </p>
        </>
      )}
    </div>
  )
}

function MarkPaidButton({
  period,
  actorId,
  onDone,
}: {
  period: PayPeriod
  actorId: string
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState('cash')

  async function pay() {
    await markPeriodPaid(period, method, actorId)
    setOpen(false)
    onDone()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
      >
        {t('payroll.markPaid')}
      </button>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <select
        value={method}
        onChange={(e) => setMethod(e.target.value)}
        className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      >
        {['cash', 'zelle', 'check', 'card', 'other'].map((m) => (
          <option key={m} value={m}>
            {t(`payroll.methods.${m}`)}
          </option>
        ))}
      </select>
      <button
        onClick={() => void pay()}
        className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
      >
        {t('common.save')}
      </button>
    </div>
  )
}

function AdjustmentsEditor({
  entry,
  actorId,
  onChanged,
}: {
  entry: PayrollEntry
  actorId: string
  onChanged: () => void | Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? 'en'
  const [items, setItems] = useState<PayrollAdjustment[]>([])
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  const reload = useCallback(async () => {
    setItems(await listAdjustments(entry.id))
  }, [entry.id])

  useEffect(() => {
    void reload()
  }, [reload])

  async function add() {
    const amt = Number(amount)
    if (!amt) return
    await addAdjustment({ payroll_entry_id: entry.id, amount: amt, reason: reason.trim() || null, created_by: actorId })
    setAmount('')
    setReason('')
    await reload()
    await onChanged()
  }

  async function remove(id: string) {
    await deleteAdjustment(id)
    await reload()
    await onChanged()
  }

  return (
    <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {t('payroll.adjustments')}
      </p>
      <ul className="mt-1 space-y-1">
        {items.map((a) => (
          <li key={a.id} className="flex items-center justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-300">
              {formatMoney(a.amount, locale)} {a.reason ? `· ${a.reason}` : ''}
            </span>
            <button onClick={() => void remove(a.id)} className="text-xs text-red-600 hover:underline dark:text-red-400">
              {t('common.delete')}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t('payroll.adjAmount')}
          className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('payroll.adjReason')}
          className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
        <button
          onClick={() => void add()}
          className="rounded-md bg-teal-700 px-3 py-1 text-sm font-medium text-white hover:bg-teal-800"
        >
          {t('common.create')}
        </button>
      </div>
    </div>
  )
}

const BASES: SalaryBasis[] = ['per_day', 'hourly', 'semi_monthly_salary']

function RatesTab() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? 'en'
  const { profile } = useAuth()
  const { users } = useUsers(true)
  const [userId, setUserId] = useState('')
  const [rates, setRates] = useState<SalaryRate[]>([])
  const [basis, setBasis] = useState<SalaryBasis>('per_day')
  const [amount, setAmount] = useState('')
  const [effective, setEffective] = useState(todayIso())
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!userId) {
      setRates([])
      return
    }
    setRates(await listRatesForUser(userId))
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  async function add() {
    setError(null)
    const amt = Number(amount)
    if (!profile || !userId || !(amt >= 0)) {
      setError(t('payroll.errors.rateRequired'))
      return
    }
    try {
      await addSalaryRate({ user_id: userId, basis, amount: amt, effective_date: effective, created_by: profile.id })
      setAmount('')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const selectedUser = users.find((u: UserProfile) => u.id === userId)

  return (
    <div className="mt-4 max-w-xl">
      <select
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      >
        <option value="">{t('payroll.selectEmployee')}</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>

      {selectedUser && (
        <>
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {t('payroll.addRate')}
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <select
                value={basis}
                onChange={(e) => setBasis(e.target.value as SalaryBasis)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              >
                {BASES.map((b) => (
                  <option key={b} value={b}>
                    {t(`payBasis.${b}`)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t('payroll.amount')}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              <input
                type="date"
                value={effective}
                onChange={(e) => setEffective(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                onClick={() => void add()}
                className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
              >
                {t('payroll.addRate')}
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>

          <h3 className="mt-5 text-sm font-semibold text-slate-800 dark:text-slate-100">
            {t('payroll.rateHistory')}
          </h3>
          <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
            {rates.length === 0 && <li className="p-3 text-sm text-slate-400">{t('payroll.noRates')}</li>}
            {rates.map((r) => (
              <li key={r.id} className="flex items-center justify-between p-3 text-sm">
                <span className="text-slate-700 dark:text-slate-200">
                  {t(`payBasis.${r.basis}`)} · {formatMoney(r.amount, locale)}
                </span>
                <span className="text-xs text-slate-400">
                  {t('payroll.effective')} {r.effective_date}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
