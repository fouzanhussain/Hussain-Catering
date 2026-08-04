import { useCallback, useEffect, useState } from 'react'

import { listUsers } from '../lib/api'
import type { UserProfile } from '../lib/types'

/** Loads the team roster. `reload` re-fetches after mutations. */
export function useUsers(includeInactive = true) {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setUsers(await listUsers(includeInactive))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [includeInactive])

  useEffect(() => {
    void reload()
  }, [reload])

  return { users, loading, error, reload }
}
