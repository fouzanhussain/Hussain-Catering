import { useTranslation } from 'react-i18next'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Service-worker update banner. `registerType: 'prompt'` means new versions
 * wait for the user to confirm a reload instead of silently swapping.
 */
export default function UpdatePrompt() {
  const { t } = useTranslation()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800">
      <p className="text-sm text-slate-700 dark:text-slate-200">{t('update.body')}</p>
      <button
        onClick={() => void updateServiceWorker(true)}
        onAuxClick={() => setNeedRefresh(false)}
        className="shrink-0 rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
      >
        {t('update.action')}
      </button>
    </div>
  )
}
