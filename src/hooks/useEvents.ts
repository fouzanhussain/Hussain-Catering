import { useCallback, useEffect, useState } from 'react'

import { listEvents } from '../lib/api'
import type { CateringEvent } from '../lib/types'

/** Events within an inclusive [start, end] date range (YYYY-MM-DD). */
export function useEvents(start: string, end: string) {
  const [events, setEvents] = useState<CateringEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setEvents(await listEvents(start, end))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [start, end])

  useEffect(() => {
    void reload()
  }, [reload])

  return { events, loading, error, reload }
}
