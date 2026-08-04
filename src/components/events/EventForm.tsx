import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  addStaffToEventChannel,
  archiveEventChannel,
  createEvent,
  createEventChannel,
  deleteEvent,
  getEventChannel,
  getEventStaffIds,
  setEventStaff,
  updateEvent,
  type EventInput,
} from '../../lib/api'
import { useUsers } from '../../hooks/useUsers'
import { useAuth } from '../../context/AuthContext'
import {
  EVENT_STATUSES,
  hasPermission,
  isEventClosed,
  type CateringEvent,
  type EventStatus,
} from '../../lib/types'

export default function EventForm({
  event,
  defaultDate,
  onClose,
  onSaved,
}: {
  event: CateringEvent | null
  defaultDate: string
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { users } = useUsers(false)
  const isEdit = Boolean(event)
  const canChannel = profile?.role === 'owner' || hasPermission(profile, 'create_channels')

  const [title, setTitle] = useState(event?.title ?? '')
  const [clientName, setClientName] = useState(event?.client_name ?? '')
  const [clientPhone, setClientPhone] = useState(event?.client_phone ?? '')
  const [venue, setVenue] = useState(event?.venue ?? '')
  const [date, setDate] = useState(event?.date ?? defaultDate)
  const [startTime, setStartTime] = useState(event?.start_time?.slice(0, 5) ?? '')
  const [endTime, setEndTime] = useState(event?.end_time?.slice(0, 5) ?? '')
  const [headcount, setHeadcount] = useState(event?.headcount != null ? String(event.headcount) : '')
  const [status, setStatus] = useState<EventStatus>(event?.status ?? 'inquiry')
  const [notes, setNotes] = useState(event?.notes ?? '')
  const [staff, setStaff] = useState<string[]>([])
  const [makeChannel, setMakeChannel] = useState(false)
  const [hasChannel, setHasChannel] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!event) return
    void getEventStaffIds(event.id).then(setStaff)
    void getEventChannel(event.id).then((c) => setHasChannel(Boolean(c)))
  }, [event])

  function toggleStaff(id: string) {
    setStaff((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!profile || !title.trim() || !date) {
      setError(t('events.errors.required'))
      return
    }
    const input: EventInput = {
      title: title.trim(),
      client_name: clientName.trim() || null,
      client_phone: clientPhone.trim() || null,
      venue: venue.trim() || null,
      date,
      start_time: startTime || null,
      end_time: endTime || null,
      headcount: headcount ? Number(headcount) : null,
      status,
      notes: notes.trim() || null,
    }
    setBusy(true)
    try {
      const saved = event ? await updateEvent(event.id, input) : await createEvent(input, profile.id)
      await setEventStaff(saved.id, staff, profile.id)

      // Event channel lifecycle (spec §4.3).
      if (isEventClosed(saved.status)) {
        await archiveEventChannel(saved.id)
      } else {
        const existing = await getEventChannel(saved.id)
        if (existing) {
          await addStaffToEventChannel(existing.id, staff, profile.id)
        } else if (makeChannel && staff.length > 0) {
          await createEventChannel(saved, staff, profile.id)
        }
      }
      await onSaved()
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!event || !confirm(t('events.confirmDelete'))) return
    setBusy(true)
    setError(null)
    try {
      await deleteEvent(event.id)
      await onSaved()
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : String(e2))
      setBusy(false)
    }
  }

  const field =
    'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'
  const labelCls = 'block text-sm font-medium text-slate-700 dark:text-slate-200'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <form
        onSubmit={submit}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl dark:bg-slate-800 sm:rounded-2xl"
      >
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
          {isEdit ? t('events.editTitle') : t('events.newTitle')}
        </h2>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="ev-title" className={labelCls}>
              {t('events.title')}
            </label>
            <input id="ev-title" className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ev-client" className={labelCls}>
                {t('events.clientName')}
              </label>
              <input
                id="ev-client"
                className={field}
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="ev-phone" className={labelCls}>
                {t('events.clientPhone')}
              </label>
              <input
                id="ev-phone"
                type="tel"
                className={field}
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="ev-venue" className={labelCls}>
              {t('events.venue')}
            </label>
            <input id="ev-venue" className={field} value={venue} onChange={(e) => setVenue(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ev-date" className={labelCls}>
                {t('events.date')}
              </label>
              <input
                id="ev-date"
                type="date"
                className={field}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="ev-headcount" className={labelCls}>
                {t('events.headcount')}
              </label>
              <input
                id="ev-headcount"
                type="number"
                min={0}
                className={field}
                value={headcount}
                onChange={(e) => setHeadcount(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ev-start" className={labelCls}>
                {t('events.startTime')}
              </label>
              <input
                id="ev-start"
                type="time"
                className={field}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="ev-end" className={labelCls}>
                {t('events.endTime')}
              </label>
              <input
                id="ev-end"
                type="time"
                className={field}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="ev-status" className={labelCls}>
              {t('events.status')}
            </label>
            <select
              id="ev-status"
              className={field}
              value={status}
              onChange={(e) => setStatus(e.target.value as EventStatus)}
            >
              {EVENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`events.statuses.${s}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ev-notes" className={labelCls}>
              {t('events.notes')}
            </label>
            <textarea
              id="ev-notes"
              rows={2}
              className={field}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div>
            <p className={labelCls}>{t('events.assignedStaff')}</p>
            <div className="mt-1 grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 p-3 dark:border-slate-600">
              {users.map((u) => (
                <label
                  key={u.id}
                  className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"
                >
                  <input
                    type="checkbox"
                    checked={staff.includes(u.id)}
                    onChange={() => toggleStaff(u.id)}
                    className="rounded border-slate-300"
                  />
                  <span className="truncate">{u.name}</span>
                </label>
              ))}
              {users.length === 0 && (
                <p className="text-sm text-slate-400">{t('events.noStaff')}</p>
              )}
            </div>
          </div>

          {canChannel && !hasChannel && !isEventClosed(status) && (
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={makeChannel}
                onChange={(e) => setMakeChannel(e.target.checked)}
                className="rounded border-slate-300"
              />
              {t('events.createChannel')}
            </label>
          )}
          {hasChannel && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isEventClosed(status) ? t('events.channelWillArchive') : t('events.channelLinked')}
            </p>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-2">
          {isEdit ? (
            <button
              type="button"
              onClick={() => void onDelete()}
              disabled={busy}
              className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              {t('common.delete')}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
