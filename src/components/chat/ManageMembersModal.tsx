import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { addChannelMember, listChannelMemberIds, removeChannelMember } from '../../lib/api'
import { useUsers } from '../../hooks/useUsers'
import { useAuth } from '../../context/AuthContext'
import type { Channel } from '../../lib/types'

/** Add/remove members for a custom channel. Owner or the channel creator. */
export default function ManageMembersModal({
  channel,
  onClose,
}: {
  channel: Channel
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { users } = useUsers(false)
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    try {
      setMemberIds(new Set(await listChannelMemberIds(channel.id)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id])

  async function toggle(userId: string, isMember: boolean) {
    if (!profile) return
    setBusyId(userId)
    setError(null)
    try {
      if (isMember) await removeChannelMember(channel.id, userId)
      else await addChannelMember(channel.id, userId, profile.id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl dark:bg-slate-800 sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
            {t('chat.members')}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            {t('common.close')}
          </button>
        </div>
        <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
          #{channel.name}
        </p>

        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-700">
          {users.map((u) => {
            const isMember = memberIds.has(u.id)
            return (
              <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {u.name}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {t(`roles.${u.role}`)}
                  </p>
                </div>
                <button
                  disabled={busyId === u.id}
                  onClick={() => void toggle(u.id, isMember)}
                  className={[
                    'shrink-0 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50',
                    isMember
                      ? 'border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700'
                      : 'bg-teal-700 text-white hover:bg-teal-800',
                  ].join(' ')}
                >
                  {isMember ? t('chat.remove') : t('chat.add')}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
