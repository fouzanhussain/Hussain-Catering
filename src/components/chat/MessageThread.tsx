import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMessages } from '../../hooks/useMessages'
import { useAuth } from '../../context/AuthContext'
import { deleteMessage, sendMessage, uploadAttachment } from '../../lib/api'
import { dayKey, formatDay, formatTime } from '../../lib/format'
import type { Channel, Message, UserProfile } from '../../lib/types'

interface Props {
  channel: Channel
  userMap: Record<string, UserProfile>
  onBack: () => void
  onManageMembers: () => void
}

export default function MessageThread({ channel, userMap, onBack, onManageMembers }: Props) {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const { messages, loading } = useMessages(channel.id)
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const canManage = profile?.role === 'owner' || channel.created_by === profile?.id
  const isCustom = channel.type === 'custom' || channel.type === 'event'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function onSend(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || (!text.trim() && !file)) return
    setSending(true)
    setError(null)
    try {
      let attachmentUrl: string | null = null
      if (file) attachmentUrl = await uploadAttachment(channel.id, file)
      await sendMessage(channel.id, profile.id, text.trim() || null, attachmentUrl)
      setText('')
      setFile(null)
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setSending(false)
    }
  }

  const locale = i18n.resolvedLanguage ?? 'en'
  let lastDay: string | null = null

  return (
    <div className="flex h-full flex-col">
      {/* Thread header */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
        <button
          onClick={onBack}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 md:hidden"
          aria-label={t('common.back')}
        >
          ←
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
            {channel.type === 'general' || channel.type === 'management'
              ? t(`chat.channelNames.${channel.type}`)
              : `#${channel.name}`}
          </p>
        </div>
        {isCustom && canManage && (
          <button
            onClick={onManageMembers}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {t('chat.members')}
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-1 overflow-y-auto bg-slate-50 px-3 py-3 dark:bg-slate-900">
        {loading && <p className="text-center text-sm text-slate-400">{t('common.loading')}</p>}
        {!loading && messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-slate-400">{t('chat.empty')}</p>
        )}
        {messages.map((m) => {
          const showDay = dayKey(m.created_at) !== lastDay
          lastDay = dayKey(m.created_at)
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-3 text-center text-xs font-medium text-slate-400">
                  {formatDay(m.created_at, locale)}
                </div>
              )}
              {m.kind === 'system' ? (
                <SystemLine message={m} />
              ) : (
                <MessageBubble
                  message={m}
                  sender={m.sender_id ? userMap[m.sender_id] : undefined}
                  mine={m.sender_id === profile?.id}
                  canDelete={m.sender_id === profile?.id || profile?.role === 'owner'}
                  locale={locale}
                />
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={onSend}
        className="border-t border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800"
      >
        {file && (
          <div className="mb-2 flex items-center gap-2 px-1 text-sm text-slate-600 dark:text-slate-300">
            <span className="truncate">📎 {file.name}</span>
            <button
              type="button"
              onClick={() => setFile(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          </div>
        )}
        {error && <p className="mb-2 px-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex items-end gap-2">
          <label className="cursor-pointer rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            📷
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void onSend(e)
              }
            }}
            rows={1}
            placeholder={t('chat.messagePlaceholder')}
            className="max-h-32 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={sending || (!text.trim() && !file)}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {t('chat.send')}
          </button>
        </div>
      </form>
    </div>
  )
}

function SystemLine({ message }: { message: Message }) {
  const { t } = useTranslation()
  const ev = message.system_event
  if (!ev) return null
  const key = ev.type === 'member_added' ? 'chat.system.memberAdded' : 'chat.system.memberRemoved'
  return (
    <p className="my-2 text-center text-xs text-slate-400">
      {t(key, { actor: ev.actor ?? '', target: ev.target ?? '' })}
    </p>
  )
}

function MessageBubble({
  message,
  sender,
  mine,
  canDelete,
  locale,
}: {
  message: Message
  sender: UserProfile | undefined
  mine: boolean
  canDelete: boolean
  locale: string
}) {
  const { t } = useTranslation()

  if (message.deleted) {
    return (
      <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
        <div className="my-0.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm italic text-slate-400 dark:bg-slate-800">
          {t('chat.deleted')}
        </div>
      </div>
    )
  }

  return (
    <div className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[80%]">
        {!mine && (
          <p className="mb-0.5 px-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            {sender?.name ?? '—'}
          </p>
        )}
        <div
          className={[
            'rounded-2xl px-3 py-2',
            mine
              ? 'bg-teal-700 text-white'
              : 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100',
          ].join(' ')}
        >
          {message.attachment_url && (
            <a href={message.attachment_url} target="_blank" rel="noreferrer">
              <img
                src={message.attachment_url}
                alt=""
                className="mb-1 max-h-64 rounded-lg object-cover"
                loading="lazy"
              />
            </a>
          )}
          {message.body && <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>}
          <div
            className={`mt-0.5 flex items-center gap-2 text-[10px] ${
              mine ? 'text-teal-100' : 'text-slate-400'
            }`}
          >
            <span>{formatTime(message.created_at, locale)}</span>
            {canDelete && (
              <button
                onClick={() => void deleteMessage(message.id)}
                className="opacity-0 transition-opacity hover:underline group-hover:opacity-100"
              >
                {t('common.delete')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
