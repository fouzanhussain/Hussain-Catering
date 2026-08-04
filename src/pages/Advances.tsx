import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuth } from '../context/AuthContext'
import { useUsers } from '../hooks/useUsers'
import { acknowledgeAdvance, listAdvances, recordAdvance } from '../lib/payrollApi'
import { hasPermission, type AdvanceMethod, type CashAdvance } from '../lib/types'
import { formatMoney } from '../lib/format'
import { todayIso } from '../lib/calendar'

const METHODS: AdvanceMethod[] = ['cash', 'zelle', 'other']

/**
 * Cash advances. log_advances holders record advances and see the full ledger
 * (amounts only — never salary). Employees see and acknowledge their own.
 */
export default function Advances() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const { users } = useUsers(true)
  const canLog = profile?.role === 'owner' || hasPermission(profile, 'log_advances')
  const locale = i18n.resolvedLanguage ?? 'en'

  const [advances, setAdvances] = useState<CashAdvance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users])

  const reload = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    setError(null)
    try {
      setAdvances(await listAdvances(canLog ? undefined : profile.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [profile, canLog])

  useEffect(() => {
    void reload()
  }, [reload])

  async function onAck(id: string) {
    await acknowledgeAdvance(id)
    await reload()
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{t('nav.advances')}</h1>

      {canLog && <RecordAdvanceForm onRecorded={reload} />}

      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loading ? (
        <p className="mt-6 text-slate-500">{t('common.loading')}</p>
      ) : advances.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">{t('advances.none')}</p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
          {advances.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {formatMoney(a.amount, locale)}
                  {canLog && (
                    <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                      {userMap.get(a.user_id) ?? '—'}
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {a.date} · {t(`advances.methods.${a.method}`)}
                  {a.note ? ` · ${a.note}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3 text-right">
                <div>
                  <p className="text-xs text-slate-400">{t('advances.remaining')}</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {formatMoney(a.remaining_balance, locale)}
                  </p>
                </div>
                {!canLog && profile?.id === a.user_id && !a.acknowledged_at && (
                  <button
                    onClick={() => void onAck(a.id)}
                    className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
                  >
                    {t('advances.acknowledge')}
                  </button>
                )}
                {a.acknowledged_at && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">
                    ✓ {t('advances.acknowledged')}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RecordAdvanceForm({ onRecorded }: { onRecorded: () => void | Promise<void> }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { users } = useUsers(false)
  const [userId, setUserId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [method, setMethod] = useState<AdvanceMethod>('cash')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const amt = Number(amount)
    if (!profile || !userId || !(amt > 0)) {
      setError(t('advances.errors.required'))
      return
    }
    setBusy(true)
    try {
      await recordAdvance({
        user_id: userId,
        amount: amt,
        date,
        method,
        note: note.trim() || null,
        recorded_by: profile.id,
      })
      setUserId('')
      setAmount('')
      setNote('')
      await onRecorded()
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setBusy(false)
    }
  }

  const field =
    'rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'

  return (
    <form
      onSubmit={submit}
      className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('advances.record')}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className={field}>
          <option value="">{t('advances.selectEmployee')}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t('advances.amount')}
          className={field}
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as AdvanceMethod)}
          className={field}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {t(`advances.methods.${m}`)}
            </option>
          ))}
        </select>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('advances.notePlaceholder')}
          className={`${field} sm:col-span-2`}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {busy ? t('common.saving') : t('advances.record')}
        </button>
      </div>
    </form>
  )
}
