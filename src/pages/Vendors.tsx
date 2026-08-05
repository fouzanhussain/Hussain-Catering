import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuth } from '../context/AuthContext'
import { useVendors, useVendorPayments } from '../hooks/useVendors'
import { markPaymentPaid, setVendorActive, uploadReceipt } from '../lib/vendorApi'
import {
  effectivePaymentStatus,
  PAYMENT_METHODS,
  type PaymentMethod,
  type Vendor,
  type VendorPayment,
  type VendorPaymentStatus,
} from '../lib/types'
import { formatMoney } from '../lib/format'
import { addDays, addMonths, formatMonthYear, monthGrid, parseIso, todayIso, weekdayLabels } from '../lib/calendar'
import VendorForm from '../components/vendors/VendorForm'
import PaymentForm from '../components/vendors/PaymentForm'

const STATUS_BADGE: Record<VendorPaymentStatus, string> = {
  scheduled: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  cancelled: 'bg-slate-200 text-slate-400 line-through dark:bg-slate-700 dark:text-slate-500',
}

export default function Vendors() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'payments' | 'vendors'>('payments')

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{t('nav.vendors')}</h1>
      <div className="mt-4 flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {(['payments', 'vendors'] as const).map((k) => (
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
            {t(`vendors.tabs.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'payments' ? <PaymentsTab /> : <VendorsTab />}
    </div>
  )
}

// --- Payments -------------------------------------------------------------

type Filter = 'upcoming' | 'overdue' | 'all'

function PaymentsTab() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? 'en'
  const today = todayIso()
  const { vendors } = useVendors(true)
  const { payments, reload } = useVendorPayments({})
  const [filter, setFilter] = useState<Filter>('upcoming')
  const [showCalendar, setShowCalendar] = useState(false)
  const [editing, setEditing] = useState<VendorPayment | null>(null)
  const [creating, setCreating] = useState(false)
  const [paying, setPaying] = useState<VendorPayment | null>(null)

  const vendorName = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors])

  const visible = useMemo(() => {
    const in30 = addDays(today, 30)
    return payments.filter((p) => {
      const eff = effectivePaymentStatus(p, today)
      if (filter === 'overdue') return eff === 'overdue'
      if (filter === 'upcoming') return p.status === 'scheduled' && p.due_date >= today && p.due_date <= in30
      return true
    })
  }, [payments, filter, today])

  const overdueCount = payments.filter((p) => effectivePaymentStatus(p, today) === 'overdue').length

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-600">
          {(['upcoming', 'overdue', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={[
                'rounded-md px-3 py-1 text-sm font-medium',
                filter === f
                  ? 'bg-teal-700 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700',
              ].join(' ')}
            >
              {t(`vendors.filters.${f}`)}
              {f === 'overdue' && overdueCount > 0 && (
                <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{overdueCount}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCalendar((s) => !s)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {t('vendors.calendar')}
          </button>
          <button
            onClick={() => setCreating(true)}
            className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
          >
            {t('vendors.schedulePayment')}
          </button>
        </div>
      </div>

      {showCalendar && <PaymentsCalendar payments={payments} vendorName={vendorName} locale={locale} />}

      {visible.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">{t('vendors.noPayments')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
          {visible.map((p) => {
            const eff = effectivePaymentStatus(p, today)
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {formatMoney(p.amount, locale)}{' '}
                    <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                      {vendorName.get(p.vendor_id) ?? '—'}
                    </span>
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t('vendors.due')} {p.due_date} · {t(`payroll.methods.${p.method}`)}
                    {p.receipt_url && (
                      <>
                        {' · '}
                        <a href={p.receipt_url} target="_blank" rel="noreferrer" className="text-teal-700 hover:underline dark:text-teal-300">
                          {t('vendors.receipt')}
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[eff]}`}>
                    {t(`vendors.statuses.${eff}`)}
                  </span>
                  {p.status !== 'paid' && p.status !== 'cancelled' && (
                    <>
                      <button
                        onClick={() => setPaying(p)}
                        className="rounded-md bg-emerald-700 px-2.5 py-1 text-sm font-medium text-white hover:bg-emerald-800"
                      >
                        {t('vendors.markPaid')}
                      </button>
                      <button
                        onClick={() => setEditing(p)}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        {t('common.edit')}
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {(creating || editing) && (
        <PaymentForm
          payment={editing}
          vendors={vendors.filter((v) => v.active)}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={async () => {
            setCreating(false)
            setEditing(null)
            await reload()
          }}
        />
      )}
      {paying && (
        <MarkPaidModal
          payment={paying}
          onClose={() => setPaying(null)}
          onDone={async () => {
            setPaying(null)
            await reload()
          }}
        />
      )}
    </div>
  )
}

function MarkPaidModal({
  payment,
  onClose,
  onDone,
}: {
  payment: VendorPayment
  onClose: () => void
  onDone: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [method, setMethod] = useState<PaymentMethod>(payment.method)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (!profile) return
    setBusy(true)
    setError(null)
    try {
      let receiptUrl: string | undefined
      if (file) receiptUrl = await uploadReceipt(payment.id, file)
      await markPaymentPaid(payment.id, method, profile.id, receiptUrl)
      await onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 shadow-xl dark:bg-slate-800 sm:rounded-2xl">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{t('vendors.markPaid')}</h2>
        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('vendors.method')}
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`payroll.methods.${m}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('vendors.receiptPhoto')}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-slate-600 dark:text-slate-300"
            />
          </label>
        </div>
        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
            {t('common.cancel')}
          </button>
          <button
            onClick={() => void confirm()}
            disabled={busy}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('vendors.confirmPaid')}
          </button>
        </div>
      </div>
    </div>
  )
}

function PaymentsCalendar({
  payments,
  vendorName,
  locale,
}: {
  payments: VendorPayment[]
  vendorName: Map<string, string>
  locale: string
}) {
  const { t } = useTranslation()
  const today = todayIso()
  const [cursor, setCursor] = useState(today)
  const { y, m } = parseIso(cursor)
  const cells = monthGrid(y, m)
  const byDay = useMemo(() => {
    const map: Record<string, VendorPayment[]> = {}
    for (const p of payments) if (p.status !== 'cancelled') (map[p.due_date] ??= []).push(p)
    return map
  }, [payments])

  function step(delta: number) {
    const next = addMonths(y, m, delta)
    setCursor(`${next.y}-${String(next.m).padStart(2, '0')}-01`)
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="mb-2 flex items-center justify-between">
        <button onClick={() => step(-1)} className="rounded-md border border-slate-300 px-2 py-0.5 text-slate-600 dark:border-slate-600 dark:text-slate-300">←</button>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{formatMonthYear(y, m, locale)}</span>
        <button onClick={() => step(1)} className="rounded-md border border-slate-300 px-2 py-0.5 text-slate-600 dark:border-slate-600 dark:text-slate-300">→</button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-slate-400">
        {weekdayLabels(locale).map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell) => {
          const dayPayments = byDay[cell.date] ?? []
          const total = dayPayments.reduce((s, p) => s + Number(p.amount), 0)
          return (
            <div
              key={cell.date}
              className={[
                'min-h-14 rounded p-1 text-left',
                cell.inMonth ? 'bg-slate-50 dark:bg-slate-800/60' : 'bg-transparent',
                cell.date === today ? 'ring-1 ring-teal-500' : '',
              ].join(' ')}
            >
              <span className="text-[10px] text-slate-400">{parseIso(cell.date).d}</span>
              {dayPayments.length > 0 && (
                <div
                  className="mt-0.5 truncate rounded bg-teal-100 px-1 text-[10px] text-teal-800 dark:bg-teal-900/50 dark:text-teal-200"
                  title={dayPayments.map((p) => vendorName.get(p.vendor_id)).join(', ')}
                >
                  {formatMoney(total, locale)}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-1 text-right text-[10px] text-slate-400">{t('vendors.calendarHint')}</p>
    </div>
  )
}

// --- Vendors --------------------------------------------------------------

function VendorsTab() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? 'en'
  const { vendors, reload } = useVendors(true)
  const { payments } = useVendorPayments({})
  const [editing, setEditing] = useState<Vendor | null>(null)
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const totals = useMemo(() => {
    const map: Record<string, { scheduled: number; paid: number }> = {}
    for (const p of payments) {
      const t = (map[p.vendor_id] ??= { scheduled: 0, paid: 0 })
      if (p.status === 'paid') t.paid += Number(p.amount)
      else if (p.status !== 'cancelled') t.scheduled += Number(p.amount)
    }
    return map
  }, [payments])

  async function toggleActive(v: Vendor) {
    await setVendorActive(v.id, !v.active)
    await reload()
  }

  return (
    <div className="mt-4">
      <div className="flex justify-end">
        <button
          onClick={() => setCreating(true)}
          className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
        >
          {t('vendors.newVendor')}
        </button>
      </div>

      {vendors.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">{t('vendors.noVendors')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
          {vendors.map((v) => {
            const total = totals[v.id] ?? { scheduled: 0, paid: 0 }
            return (
              <li key={v.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <button onClick={() => setExpanded(expanded === v.id ? null : v.id)} className="min-w-0 text-left">
                    <p className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                      <span className="truncate">{v.name}</span>
                      {!v.active && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-600 dark:text-slate-300">
                          {t('team.inactive')}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                      {[v.category, v.phone].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </button>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => setEditing(v)}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={() => void toggleActive(v)}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      {v.active ? t('team.deactivate') : t('team.reactivate')}
                    </button>
                  </div>
                </div>
                {expanded === v.id && (
                  <div className="mt-2 flex gap-4 text-sm">
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('vendors.outstanding')}: <span className="font-medium text-slate-800 dark:text-slate-100">{formatMoney(total.scheduled, locale)}</span>
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('vendors.paidTotal')}: <span className="font-medium text-slate-800 dark:text-slate-100">{formatMoney(total.paid, locale)}</span>
                    </span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {(creating || editing) && (
        <VendorForm
          vendor={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={async () => {
            setCreating(false)
            setEditing(null)
            await reload()
          }}
        />
      )}
    </div>
  )
}
