import { useCallback, useEffect, useRef, useState } from 'react'

import { supabase } from '../lib/supabase'
import { listMessages, markChannelRead } from '../lib/api'
import type { Message } from '../lib/types'
import { useAuth } from '../context/AuthContext'

/**
 * Loads and live-subscribes to a channel's messages. New inserts and updates
 * (soft-deletes/edits) are merged in real time; the channel is marked read as
 * messages arrive while it's open.
 */
export function useMessages(channelId: string | null) {
  const { profile } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const channelIdRef = useRef(channelId)
  channelIdRef.current = channelId

  const markRead = useCallback(() => {
    if (channelId && profile) void markChannelRead(channelId, profile.id)
  }, [channelId, profile])

  useEffect(() => {
    if (!channelId) {
      setMessages([])
      return
    }
    let active = true
    setLoading(true)
    setError(null)

    listMessages(channelId)
      .then((rows) => {
        if (!active) return
        setMessages(rows)
        markRead()
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => active && setLoading(false))

    const sub = supabase
      .channel(`rt-messages-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const msg = payload.new as Message
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
          )
          // We're viewing this channel, so keep it marked read.
          if (channelIdRef.current === channelId) markRead()
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const msg = payload.new as Message
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)))
        },
      )
      .subscribe()

    return () => {
      active = false
      void supabase.removeChannel(sub)
    }
  }, [channelId, markRead])

  return { messages, loading, error, markRead }
}
