import { useCallback, useEffect, useState, type DependencyList } from 'react'

/** Loads a list via an async fetcher, with a `reload` and loading/error state. */
export function useAsyncList<T>(fetcher: () => Promise<T[]>, deps: DependencyList = []) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // The fetcher identity isn't stable across renders; key the callback on deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fetcher, deps)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await load())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [load])

  useEffect(() => {
    void reload()
  }, [reload])

  return { items, loading, error, reload }
}
