import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useChannels } from '../hooks/useChannels'
import { useUsers } from '../hooks/useUsers'
import { useAuth } from '../context/AuthContext'
import { createChannel } from '../lib/api'
import { hasPermission, type Channel, type UserProfile } from '../lib/types'
import MessageThread from '../components/chat/MessageThread'
import ManageMembersModal from '../components/chat/ManageMembersModal'

export default function Chat() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { channels, loading, reload } = useChannels()
  const { users } = useUsers(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [managing, setManaging] = useState<Channel | null>(null)

  const userMap = useMemo(() => {
    const m: Record<string, UserProfile> = {}
    for (const u of users) m[u.id] = u
    return m
  }, [users])

  const selected = channels.find((c) => c.id === selectedId) ?? null
  const canCreate = profile?.role === 'owner' || hasPermission(profile, 'create_channels')

  function channelLabel(c: Channel): string {
    if (c.type === 'general' || c.type === 'management') return t(`chat.channelNames.${c.type}`)
    return `#${c.name}`
  }

  return (
    <div className="h-[calc(100dvh-8.5rem)]">
      <div className="grid h-full md:grid-cols-[18rem_1fr]">
        {/* Sidebar (hidden on mobile when a channel is open) */}
        <aside
          className={[
            'flex flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800',
            selected ? 'hidden md:flex' : 'flex',
          ].join(' ')}
        >
          <div className="flex items-center justify-between border-b border-slate-200 p-3 dark:border-slate-700">
            <h1 className="font-semibold text-slate-900 dark:text-slate-100">{t('nav.chat')}</h1>
            {canCreate && <CreateChannel onCreated={reload} />}
          </div>
          <ul className="flex-1 overflow-y-auto p-2">
            {loading && <li className="p-2 text-sm text-slate-400">{t('common.loading')}</li>}
            {channels.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setSelectedId(c.id)}
                  className={[
                    'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm',
                    c.id === selectedId
                      ? 'bg-teal-50 text-teal-900 dark:bg-teal-950/50 dark:text-teal-200'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700',
                  ].join(' ')}
                >
                  <span className="truncate">{channelLabel(c)}</span>
                  {c.unread > 0 && (
                    <span className="ml-auto shrink-0 rounded-full bg-teal-700 px-2 py-0.5 text-xs font-semibold text-white">
                      {c.unread}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Thread */}
        <section className={selected ? 'flex flex-col' : 'hidden md:flex md:flex-col'}>
          {selected ? (
            <MessageThread
              channel={selected}
              userMap={userMap}
              onBack={() => setSelectedId(null)}
              onManageMembers={() => setManaging(selected)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              {t('chat.selectChannel')}
            </div>
          )}
        </section>
      </div>

      {managing && (
        <ManageMembersModal channel={managing} onClose={() => setManaging(null)} />
      )}
    </div>
  )
}

function CreateChannel({ onCreated }: { onCreated: () => void | Promise<void> }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await createChannel(name.trim(), profile.id)
      setName('')
      setOpen(false)
      await onCreated()
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-teal-700 px-2.5 py-1 text-sm font-medium text-white hover:bg-teal-800"
        aria-label={t('chat.newChannel')}
      >
        +
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-t-2xl bg-white p-6 shadow-xl dark:bg-slate-800 sm:rounded-2xl"
      >
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
          {t('chat.newChannel')}
        </h2>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('chat.channelNamePlaceholder')}
          className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('common.create')}
          </button>
        </div>
      </form>
    </div>
  )
}
