import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { createPayment, updatePayment } from '../../lib/vendorApi'
import { useAuth } from '../../context/AuthContext'
import { todayIso } from '../../lib/calendar'
import { PAYMENT_METHODS, type PaymentMethod, type Vendor, type VendorPayment } from '../../lib/types'

export default function PaymentForm({
  payment,
  vendors,
  onClose,
  onSaved,
}: {
  payment: VendorPayment | null
  vendors: Vendor[]
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [vendorId, setVendorId] = useState(payment?.vendor_id ?? '')
  const [amount, setAmount] = useState(payment ? String(payment.amount) : '')
  const [dueDate, setDueDate] = useState(payment?.due_date ?? todayIso())
  const [method, setMethod] = useState<PaymentMethod>(payment?.method ?? 'cash')
  const [reminderDays, setReminderDays] = useState(String(payment?.reminder_days ?? 2))
  const [notes, setNotes] = useState(payment?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const amt = Number(amount)
    if (!profile || !vendorId || !(amt >= 0) || !dueDate) {
      setError(t('vendors.errors.paymentRequired'))
      return
    }
    setBusy(true)
    try {
      const input = {
        vendor_id: vendorId,
        amount: amt,
        due_date: dueDate,
        method,
        notes: notes.trim() || null,
        reminder_days: Number(reminderDays) || 0,
      }
      if (payment) await updatePayment(payment.id, input)
      else await createPayment(input, profile.id)
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
          {payment ? t('vendors.editPayment') : t('vendors.schedulePayment')}
        </h2>
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="pf-vendor" className={labelCls}>
              {t('vendors.vendor')}
            </label>
            <select id="pf-vendor" className={field} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">{t('vendors.selectVendor')}</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pf-amount" className={labelCls}>
                {t('vendors.amount')}
              </label>
              <input
                id="pf-amount"
                type="number"
                step="0.01"
                min={0}
                className={field}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="pf-due" className={labelCls}>
                {t('vendors.dueDate')}
              </label>
              <input id="pf-due" type="date" className={field} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pf-method" className={labelCls}>
                {t('vendors.method')}
              </label>
              <select id="pf-method" className={field} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`payroll.methods.${m}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pf-remind" className={labelCls}>
                {t('vendors.remindDays')}
              </label>
              <input
                id="pf-remind"
                type="number"
                min={0}
                className={field}
                value={reminderDays}
                onChange={(e) => setReminderDays(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label htmlFor="pf-notes" className={labelCls}>
              {t('vendors.notes')}
            </label>
            <textarea id="pf-notes" rows={2} className={field} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
