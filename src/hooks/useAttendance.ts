import { useCallback, useEffect, useState } from 'react'

import { listAttendanceByDate, listAttendanceForUser, listUsers } from '../lib/api'
import type { Attendance, UserProfile } from '../lib/types'

export interface RosterRow {
  user: UserProfile
  attendance: Attendance | null
}

/** Manager daily roster: every active employee for a date + their record. */
export function useRoster(date: string) {
  const [rows, setRows] = useState<RosterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [users, records] = await Promise.all([
        listUsers(false), // active only
        listAttendanceByDate(date),
      ])
      const byUser = new Map(records.map((r) => [r.user_id, r]))
      setRows(users.map((user) => ({ user, attendance: byUser.get(user.id) ?? null })))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    void reload()
  }, [reload])

  return { rows, loading, error, reload }
}

/** An employee's own attendance over a date range (self-view / history). */
export function useUserAttendance(userId: string | null, start: string, end: string) {
  const [records, setRecords] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      setRecords(await listAttendanceForUser(userId, start, end))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [userId, start, end])

  useEffect(() => {
    void reload()
  }, [reload])

  return { records, loading, error, reload }
}
