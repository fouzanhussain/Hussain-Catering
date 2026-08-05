import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuth } from '../context/AuthContext'
import { useUsers } from '../hooks/useUsers'
import { createCashEntry, listCashEntries, listCashLog, setCashStatus, uploadOpsPhoto } from '../lib/opsApi'
import { nextCashStatus, type CashEntry, type CashEntryLog, type CashStatus } from '../lib/types'
import { formatMoney, formatDay, formatTime } from '../lib/format'
import { useAsyncList } from '../hooks/useAsyncList'
import CommentThread from '../components/CommentThread'

const STATUS_BADGE: Record<CashStatus, string> = {
  picked_up: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  delivered_to_owner: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
  deposited: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
}

export default function Cash() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? 'en'
  const { profile } = useAuth()
  const { users } = useUsers(true)
  const nameOf = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users])
  const { items: entries, loading, reload } = useAsyncList(listCashEntries)
  const [expanded, setExpanded] = useState<string | null>(null)

  const inTransit = entries
    .filter((e) => e.status !== 'deposited')
    .reduce((s, e) => s + Number(e.amount), 0)

  const isOwner = profile?.role === 'owner'

  async function advance(entry: CashEntry) {
    const next = nextCashStatus(entry.status)
    if (!next) return
    await setCashStatus(entry.id, next, next === 'delivered_to_owner' ? profile?.id : undefined)
    await reload()
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{t('nav.cash')}</h1>

      <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-900 dark:bg-teal-950/40">
        <p className="text-sm text-teal-800 dark:text-teal-300">{t('cash.inTransit')}</p>
        <p className="text-2xl font-bold text-teal-900 dark:text-teal-100">
          {formatMoney(inTransit, locale)}
        </p>
      </div>

      <FilePickupForm onFiled={reload} />

      {loading ? (
        <p className="mt-6 text-slate-500">{t('common.loading')}</p>
      ) : entries.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">{t('cash.none')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
          {entries.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {formatMoney(e.amount, locale)}{' '}
                    <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                      {e.picked_up_by ? nameOf.get(e.picked_up_by) ?? '—' : '—'}
                    </span>
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {formatDay(e.created_at, locale)}
                  </p>
                </div>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[e.status]}`}>
                  {t(`cash.statuses.${e.status}`)}
                </span>
              </button>
              {expanded === e.id && (
                <div className="border-t border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                  {e.notes && <p className="text-sm text-slate-600 dark:text-slate-300">{e.notes}</p>}
                  {e.photo_url && (
                    <a href={e.photo_url} target="_blank" rel="noreferrer">
                      <img src={e.photo_url} alt="" className="mt-2 max-h-48 rounded-lg" loading="lazy" />
                    </a>
                  )}

                  {isOwner && nextCashStatus(e.status) && (
                    <button
                      onClick={() => void advance(e)}
                      className="mt-3 rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
                    >
                      {e.status === 'picked_up' ? t('cash.confirmReceipt') : t('cash.markDeposited')}
                    </button>
                  )}

                  <CustodyLog entryId={e.id} nameOf={nameOf} locale={locale} />
                  <CommentThread entityType="cash" entityId={e.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CustodyLog({
  entryId,
  nameOf,
  locale,
}: {
  entryId: string
  nameOf: Map<string, string>
  locale: string
}) {
  const { t } = useTranslation()
  const { items: log } = useAsyncList<CashEntryLog>(() => listCashLog(entryId), [entryId])
  if (log.length === 0) return null
  return (
    <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('cash.custody')}</p>
      <ul className="mt-1 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
        {log.map((l) => (
          <li key={l.id}>
            {t(`cash.statuses.${l.to_status}`)} · {l.acted_by ? nameOf.get(l.acted_by) ?? '—' : '—'} ·{' '}
            {formatDay(l.at, locale)} {formatTime(l.at, locale)}
          </li>
        ))}
      </ul>
    </div>
  )
}

function FilePickupForm({ onFiled }: { onFiled: () => void | Promise<void> }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const amt = Number(amount)
    if (!profile || !(amt >= 0) || !amount) {
      setError(t('cash.errors.amountRequired'))
      return
    }
    setBusy(true)
    try {
      let photo_url: string | null = null
      if (file) photo_url = await uploadOpsPhoto('cash', file)
      await createCashEntry({ amount: amt, notes: notes.trim() || null, photo_url, picked_up_by: profile.id })
      setAmount('')
      setNotes('')
      setFile(null)
      await onFiled()
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setBusy(false)
    }
  }

  const field =
    'rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'

  return (
    <form
      onSubmit={submit}
      className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('cash.filePickup')}</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input
          type="number"
          step="0.01"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t('cash.amount')}
          className={field}
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('cash.sourceNotes')}
          className={field}
        />
        <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          {t('cash.photo')}
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-3 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
      >
        {busy ? t('common.saving') : t('cash.filePickup')}
      </button>
    </form>
  )
}
