import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { createVendor, updateVendor } from '../../lib/vendorApi'
import { useAuth } from '../../context/AuthContext'
import type { Vendor } from '../../lib/types'

export default function VendorForm({
  vendor,
  onClose,
  onSaved,
}: {
  vendor: Vendor | null
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [name, setName] = useState(vendor?.name ?? '')
  const [phone, setPhone] = useState(vendor?.phone ?? '')
  const [category, setCategory] = useState(vendor?.category ?? '')
  const [notes, setNotes] = useState(vendor?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!profile || !name.trim()) {
      setError(t('vendors.errors.nameRequired'))
      return
    }
    setBusy(true)
    try {
      const input = {
        name: name.trim(),
        phone: phone.trim() || null,
        category: category.trim() || null,
        notes: notes.trim() || null,
      }
      if (vendor) await updateVendor(vendor.id, input)
      else await createVendor(input, profile.id)
      await onSaved()
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setBusy(false)
    }
  }

  const field =
    'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'
  const labelCls = 'block text-sm font-medium text-slate-700 dark:text-slate-200'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <form
        onSubmit={submit}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl dark:bg-slate-800 sm:rounded-2xl"
      >
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
          {vendor ? t('vendors.editVendor') : t('vendors.newVendor')}
        </h2>
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="vf-name" className={labelCls}>
              {t('vendors.name')}
            </label>
            <input id="vf-name" className={field} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="vf-phone" className={labelCls}>
                {t('vendors.phone')}
              </label>
              <input id="vf-phone" type="tel" className={field} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label htmlFor="vf-cat" className={labelCls}>
                {t('vendors.category')}
              </label>
              <input id="vf-cat" className={field} value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
          </div>
          <div>
            <label htmlFor="vf-notes" className={labelCls}>
              {t('vendors.notes')}
            </label>
            <textarea id="vf-notes" rows={2} className={field} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  )
}
