import { useTranslation } from 'react-i18next'

import { formatMoney } from '../../lib/format'
import type { PayPeriod, PayrollEntry } from '../../lib/types'

/** Localized payslip breakdown for one entry (spec §4.5.5). */
export default function Payslip({
  entry,
  period,
}: {
  entry: PayrollEntry
  period?: PayPeriod
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? 'en'

  const line = (label: string, value: string, strong = false) => (
    <div className="flex justify-between py-1">
      <span className={strong ? 'font-medium text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}>
        {label}
      </span>
      <span className={`tabular-nums ${strong ? 'font-semibold text-slate-900 dark:text-slate-50' : 'text-slate-700 dark:text-slate-200'}`}>
        {value}
      </span>
    </div>
  )

  return (
    <div className="text-sm">
      {period && (
        <p className="mb-2 text-xs text-slate-400">
          {period.start_date} → {period.end_date} · {t('payroll.payout')} {period.payout_date}
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
        <span>{t('attendance.status.present')}: {entry.present_days}</span>
        <span>{t('attendance.status.half_day')}: {entry.half_days}</span>
        <span>{t('attendance.status.absent')}: {entry.absent_days}</span>
        <span>{t('attendance.status.excused_paid')}: {entry.excused_paid}</span>
        <span>{t('attendance.status.excused_unpaid')}: {entry.excused_unpaid}</span>
        {entry.total_hours > 0 && <span>{t('attendance.hours')}: {entry.total_hours}</span>}
      </div>

      <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700">
        {line(t('payroll.gross'), formatMoney(entry.gross, locale))}
        {entry.adjustments_total !== 0 &&
          line(t('payroll.adjustments'), formatMoney(entry.adjustments_total, locale))}
        {entry.advances_deducted !== 0 &&
          line(t('payroll.advancesDeducted'), `- ${formatMoney(entry.advances_deducted, locale)}`)}
        {line(t('payroll.net'), formatMoney(entry.net, locale), true)}
        {entry.carryover > 0 && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            {t('payroll.carryover', { amount: formatMoney(entry.carryover, locale) })}
          </p>
        )}
        <p className="mt-1 text-xs text-slate-400">
          {t('payroll.roundingApplied', {
            mode: t(`rounding.${entry.rounding_mode_snapshot ?? 'cent'}`),
          })}
        </p>
        {entry.paid_at && (
          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
            ✓ {t('payroll.paidOn', { date: entry.paid_at.slice(0, 10), method: entry.paid_method ?? '' })}
          </p>
        )}
      </div>
    </div>
  )
}
