import { useCallback, useEffect, useState } from 'react'

import { supabase } from '../lib/supabase'
import { fetchUnreadCounts, listMyChannels } from '../lib/api'
import type { ChannelWithMeta } from '../lib/types'
import { useAuth } from '../context/AuthContext'

/**
 * Loads the current user's channels with unread counts. Subscribes to
 * membership changes (added/removed from a channel) and to new messages so the
 * unread badges stay live without a manual refresh.
 */
export function useChannels() {
  const { profile } = useAuth()
  const [channels, setChannels] = useState<ChannelWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    try {
      const [list, unread] = await Promise.all([listMyChannels(), fetchUnreadCounts()])
      setChannels(list.map((c) => ({ ...c, unread: unread[c.id] ?? 0 })))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshUnread = useCallback(async () => {
    try {
      const unread = await fetchUnreadCounts()
      setChannels((prev) => prev.map((c) => ({ ...c, unread: unread[c.id] ?? 0 })))
    } catch {
      /* transient; next reload corrects it */
    }
  }, [])

  useEffect(() => {
    if (!profile) return
    void reload()

    // Membership changes affect which channels appear at all → full reload.
    const memberCh = supabase
      .channel('rt-my-memberships')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channel_members',
          filter: `user_id=eq.${profile.id}`,
        },
        () => void reload(),
      )
      .subscribe()

    // Any new message may bump an unread count → cheap recount.
    const msgCh = supabase
      .channel('rt-unread')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => void refreshUnread(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(memberCh)
      void supabase.removeChannel(msgCh)
    }
  }, [profile, reload, refreshUnread])

  return { channels, loading, error, reload, refreshUnread }
}
