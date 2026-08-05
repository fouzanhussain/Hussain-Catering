import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuth } from '../context/AuthContext'
import { useUsers } from '../hooks/useUsers'
import { useAsyncList } from '../hooks/useAsyncList'
import { createInventory, decideInventory, listInventory, uploadOpsPhoto } from '../lib/opsApi'
import {
  hasPermission,
  INVENTORY_STATUSES,
  type InventoryRequest,
  type InventoryStatus,
  type InventoryUrgency,
} from '../lib/types'
import { formatDay } from '../lib/format'
import CommentThread from '../components/CommentThread'

const STATUS_BADGE: Record<InventoryStatus, string> = {
  requested: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  approved: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
  purchased: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
  received: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  rejected: 'bg-red-100 text-red-700 line-through dark:bg-red-900/40 dark:text-red-300',
}

// Which decisions are available from each status.
const NEXT: Partial<Record<InventoryStatus, InventoryStatus[]>> = {
  requested: ['approved', 'rejected'],
  approved: ['purchased'],
  purchased: ['received'],
}

export default function Inventory() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { users } = useUsers(true)
  const nameOf = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users])
  const { items, loading, reload } = useAsyncList(listInventory)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [selected, setSelected] = useState<InventoryRequest | null>(null)

  const canApprove = profile?.role === 'owner' || hasPermission(profile, 'approve_inventory')

  const visible = urgentOnly ? items.filter((r) => r.urgency === 'urgent') : items
  const selectedLive = selected ? items.find((r) => r.id === selected.id) ?? selected : null

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{t('nav.inventory')}</h1>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} />
            {t('inventory.urgentOnly')}
          </label>
          <div className="inline-flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-600">
            {(['board', 'list'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={[
                  'rounded-md px-3 py-1 text-sm font-medium',
                  view === v ? 'bg-teal-700 text-white' : 'text-slate-600 dark:text-slate-300',
                ].join(' ')}
              >
                {t(`inventory.views.${v}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <RequestForm onCreated={reload} />

      {loading ? (
        <p className="mt-6 text-slate-500">{t('common.loading')}</p>
      ) : view === 'board' ? (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
          {INVENTORY_STATUSES.map((status) => {
            const col = visible.filter((r) => r.status === status)
            return (
              <div key={status} className="w-56 shrink-0">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_BADGE[status]}`}>
                    {t(`inventory.statuses.${status}`)}
                  </span>
                  <span className="text-slate-400">{col.length}</span>
                </p>
                <div className="space-y-2">
                  {col.map((r) => (
                    <Card key={r.id} r={r} nameOf={nameOf} onClick={() => setSelected(r)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
          {visible.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setSelected(r)}
                className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40"
              >
                <span className="min-w-0">
                  <span className="font-medium text-slate-900 dark:text-slate-100">{r.item}</span>
                  {r.qty != null && (
                    <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">
                      {r.qty} {r.unit}
                    </span>
                  )}
                </span>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>
                  {t(`inventory.statuses.${r.status}`)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedLive && (
        <DetailModal
          request={selectedLive}
          nameOf={nameOf}
          canApprove={canApprove}
          onClose={() => setSelected(null)}
          onDecided={reload}
        />
      )}
    </div>
  )
}

function Card({
  r,
  nameOf,
  onClick,
}: {
  r: InventoryRequest
  nameOf: Map<string, string>
  onClick: () => void
}) {
  const { t } = useTranslation()
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-left shadow-sm hover:shadow dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-slate-900 dark:text-slate-100">{r.item}</span>
        {r.urgency === 'urgent' && (
          <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
            {t('inventory.urgent')}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        {r.qty != null ? `${r.qty} ${r.unit ?? ''} · ` : ''}
        {r.requested_by ? nameOf.get(r.requested_by) ?? '' : ''}
      </p>
    </button>
  )
}

function DetailModal({
  request,
  nameOf,
  canApprove,
  onClose,
  onDecided,
}: {
  request: InventoryRequest
  nameOf: Map<string, string>
  canApprove: boolean
  onClose: () => void
  onDecided: () => void | Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? 'en'
  const { profile } = useAuth()
  const [busy, setBusy] = useState(false)

  async function decide(status: InventoryStatus) {
    if (!profile) return
    setBusy(true)
    try {
      await decideInventory(request.id, status, profile.id)
      await onDecided()
    } finally {
      setBusy(false)
    }
  }

  const nextOptions = NEXT[request.status] ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl dark:bg-slate-800 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{request.item}</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
            {t('common.close')}
          </button>
        </div>
        <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
          {request.qty != null && <p>{t('inventory.qty')}: {request.qty} {request.unit}</p>}
          <p>{t('inventory.urgency')}: {t(`inventory.urgencies.${request.urgency}`)}</p>
          {request.needed_by && <p>{t('inventory.neededBy')}: {formatDay(`${request.needed_by}T12:00:00Z`, locale)}</p>}
          <p>{t('inventory.requestedBy')}: {request.requested_by ? nameOf.get(request.requested_by) ?? '—' : '—'}</p>
          <p>{t('inventory.status')}: {t(`inventory.statuses.${request.status}`)}</p>
          {request.notes && <p className="text-slate-500 dark:text-slate-400">{request.notes}</p>}
        </div>
        {request.photo_url && (
          <a href={request.photo_url} target="_blank" rel="noreferrer">
            <img src={request.photo_url} alt="" className="mt-2 max-h-48 rounded-lg" loading="lazy" />
          </a>
        )}

        {canApprove && nextOptions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {nextOptions.map((s) => (
              <button
                key={s}
                onClick={() => void decide(s)}
                disabled={busy}
                className={[
                  'rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50',
                  s === 'rejected' ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-700 hover:bg-teal-800',
                ].join(' ')}
              >
                {t(`inventory.actions.${s}`)}
              </button>
            ))}
          </div>
        )}

        <CommentThread entityType="inventory" entityId={request.id} />
      </div>
    </div>
  )
}

function RequestForm({ onCreated }: { onCreated: () => void | Promise<void> }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [item, setItem] = useState('')
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState('')
  const [urgency, setUrgency] = useState<InventoryUrgency>('normal')
  const [neededBy, setNeededBy] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!profile || !item.trim()) {
      setError(t('inventory.errors.itemRequired'))
      return
    }
    setBusy(true)
    try {
      let photo_url: string | null = null
      if (file) photo_url = await uploadOpsPhoto('inventory', file)
      await createInventory({
        item: item.trim(),
        qty: qty ? Number(qty) : null,
        unit: unit.trim() || null,
        urgency,
        needed_by: neededBy || null,
        notes: notes.trim() || null,
        photo_url,
        requested_by: profile.id,
      })
      setItem('')
      setQty('')
      setUnit('')
      setUrgency('normal')
      setNeededBy('')
      setNotes('')
      setFile(null)
      setOpen(false)
      await onCreated()
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setBusy(false)
    }
  }

  const field =
    'rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
      >
        {t('inventory.newRequest')}
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('inventory.newRequest')}</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input value={item} onChange={(e) => setItem(e.target.value)} placeholder={t('inventory.item')} className={`${field} sm:col-span-2`} />
        <input type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={t('inventory.qty')} className={field} />
        <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={t('inventory.unit')} className={field} />
        <select value={urgency} onChange={(e) => setUrgency(e.target.value as InventoryUrgency)} className={field}>
          <option value="normal">{t('inventory.urgencies.normal')}</option>
          <option value="urgent">{t('inventory.urgencies.urgent')}</option>
        </select>
        <input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} className={field} />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('inventory.notes')} className={`${field} sm:col-span-2`} />
        <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 sm:col-span-2">
          {t('inventory.photo')}
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={busy} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50">
          {busy ? t('common.saving') : t('common.create')}
        </button>
      </div>
    </form>
  )
}
