import { useCallback, useEffect, useState } from 'react'

import { supabase } from '../lib/supabase'
import { listNotifications, markAllRead, markNotificationRead } from '../lib/notificationApi'
import { useAuth } from '../context/AuthContext'
import type { AppNotification } from '../lib/types'

/** Loads the user's notifications and keeps the unread badge live via realtime. */
export function useNotifications() {
  const { profile } = useAuth()
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      setItems(await listNotifications())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!profile) return
    void reload()
    const ch = supabase
      .channel('rt-notifications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        () => void reload(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [profile, reload])

  const unread = items.filter((n) => !n.read).length

  async function markRead(id: string) {
    await markNotificationRead(id)
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  async function readAll() {
    await markAllRead()
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  return { items, unread, loading, reload, markRead, readAll }
}
