import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { addComment, deleteComment, listComments } from '../lib/opsApi'
import { useAuth } from '../context/AuthContext'
import { useUsers } from '../hooks/useUsers'
import { formatDay, formatTime } from '../lib/format'
import type { Comment, CommentEntity } from '../lib/types'

/** A comment thread attached to a record (cash entry, inventory request, …). */
export default function CommentThread({
  entityType,
  entityId,
}: {
  entityType: CommentEntity
  entityId: string
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? 'en'
  const { profile } = useAuth()
  const { users } = useUsers(true)
  const nameOf = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users])
  const [comments, setComments] = useState<Comment[]>([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    setComments(await listComments(entityType, entityId))
  }, [entityType, entityId])

  useEffect(() => {
    void reload()
  }, [reload])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !body.trim()) return
    setBusy(true)
    try {
      await addComment(entityType, entityId, profile.id, body.trim())
      setBody('')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    await deleteComment(id)
    await reload()
  }

  return (
    <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('comments.title')}</p>
      <ul className="mt-2 space-y-2">
        {comments.length === 0 && (
          <li className="text-sm text-slate-400">{t('comments.none')}</li>
        )}
        {comments.map((c) => (
          <li key={c.id} className="group text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {c.sender_id ? nameOf.get(c.sender_id) ?? '—' : '—'}
              </span>
              <span className="text-xs text-slate-400">
                {formatDay(c.created_at, locale)} {formatTime(c.created_at, locale)}
              </span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <p className="whitespace-pre-wrap break-words text-slate-600 dark:text-slate-300">
                {c.body}
              </p>
              {(c.sender_id === profile?.id || profile?.role === 'owner') && (
                <button
                  onClick={() => void remove(c.id)}
                  className="shrink-0 text-xs text-red-600 opacity-0 transition-opacity hover:underline group-hover:opacity-100 dark:text-red-400"
                >
                  {t('common.delete')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('comments.placeholder')}
          className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={busy || !body.trim()}
          className="rounded-md bg-teal-700 px-3 py-1 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-40"
        >
          {t('comments.post')}
        </button>
      </form>
    </div>
  )
}
