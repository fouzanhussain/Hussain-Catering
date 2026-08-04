import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

// Minimal typing for the non-standard beforeinstallprompt event.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Custom "Add to home screen" prompt. Captures the browser's deferred
 * beforeinstallprompt event so we can surface our own localized banner.
 */
export default function InstallPrompt() {
  const { t } = useTranslation()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('hc.installDismissed') === '1',
  )

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  if (!deferred || dismissed) return null

  async function onInstall() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
  }

  function onDismiss() {
    sessionStorage.setItem('hc.installDismissed', '1')
    setDismissed(true)
  }

  return (
    <div
      role="dialog"
      aria-label={t('install.title')}
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-800"
    >
      <p className="font-medium text-slate-900 dark:text-slate-100">{t('install.title')}</p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t('install.body')}</p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={onDismiss}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {t('install.dismiss')}
        </button>
        <button
          onClick={() => void onInstall()}
          className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
        >
          {t('install.action')}
        </button>
      </div>
    </div>
  )
}
