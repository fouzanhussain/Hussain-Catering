import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useNotifications } from '../hooks/useNotifications'
import { useAuth } from '../context/AuthContext'
import { isPushSubscribed, pushSupported, subscribeToPush, unsubscribeFromPush } from '../lib/notificationApi'
import { formatDay, formatTime } from '../lib/format'

export default function NotificationsBell() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? 'en'
  const { profile } = useAuth()
  const { items, unread, markRead, readAll } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
        aria-label={t('notifications.title')}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between border-b border-slate-200 p-3 dark:border-slate-700">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {t('notifications.title')}
            </span>
            {unread > 0 && (
              <button
                onClick={() => void readAll()}
                className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-300"
              >
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

          <PushToggle userId={profile?.id} />

          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <li className="p-4 text-center text-sm text-slate-400">{t('notifications.empty')}</li>
            )}
            {items.map((n) => (
              <li
                key={n.id}
                onClick={() => !n.read && void markRead(n.id)}
                className={[
                  'cursor-pointer border-b border-slate-100 p-3 last:border-0 dark:border-slate-700/60',
                  n.read ? '' : 'bg-teal-50/60 dark:bg-teal-950/30',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {n.payload.title ?? t(`notifications.types.${n.type}`, { defaultValue: n.type })}
                  </p>
                  <span className="shrink-0 text-[10px] text-slate-400">
                    {formatDay(n.created_at, locale)} {formatTime(n.created_at, locale)}
                  </span>
                </div>
                {n.payload.body && (
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{n.payload.body}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function PushToggle({ userId }: { userId?: string }) {
  const { t } = useTranslation()
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supported = pushSupported()

  useEffect(() => {
    if (supported) void isPushSubscribed().then(setSubscribed)
  }, [supported])

  if (!supported || !userId) return null

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      if (subscribed) {
        await unsubscribeFromPush()
        setSubscribed(false)
      } else {
        await subscribeToPush(userId!)
        setSubscribed(true)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b border-slate-200 p-3 dark:border-slate-700">
      <button
        onClick={() => void toggle()}
        disabled={busy}
        className="text-sm font-medium text-teal-700 hover:underline disabled:opacity-50 dark:text-teal-300"
      >
        {subscribed ? t('notifications.disablePush') : t('notifications.enablePush')}
      </button>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
