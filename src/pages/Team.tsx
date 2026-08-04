import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useUsers } from '../hooks/useUsers'
import { createUser, setUserActive, updateUser, type UpsertUserInput } from '../lib/api'
import {
  PERMISSION_KEYS,
  defaultPermissions,
  type Permissions,
  type Role,
  type PayGroup,
  type RoundingMode,
  type UserProfile,
} from '../lib/types'

const ROLES: Role[] = ['owner', 'manager', 'employee']
const PAY_GROUPS: PayGroup[] = ['group_1_15', 'group_5_20']
const ROUNDING: RoundingMode[] = ['cent', 'dollar']

/** Owner-only team & roles management (spec §4.1). */
export default function Team() {
  const { t } = useTranslation()
  const { users, loading, error, reload } = useUsers(true)
  const [editing, setEditing] = useState<UserProfile | null>(null)
  const [creating, setCreating] = useState(false)

  async function toggleActive(u: UserProfile) {
    await setUserActive(u.id, !u.active)
    await reload()
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{t('nav.team')}</h1>
        <button
          onClick={() => setCreating(true)}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
        >
          {t('team.invite')}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loading ? (
        <p className="mt-6 text-slate-500">{t('common.loading')}</p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                  <span className="truncate">{u.name}</span>
                  {!u.active && (
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-600 dark:text-slate-200">
                      {t('team.inactive')}
                    </span>
                  )}
                </p>
                <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                  {t(`roles.${u.role}`)} · {u.phone ?? '—'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => setEditing(u)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {t('common.edit')}
                </button>
                <button
                  onClick={() => void toggleActive(u)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {u.active ? t('team.deactivate') : t('team.reactivate')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(creating || editing) && (
        <UserForm
          user={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={async () => {
            setCreating(false)
            setEditing(null)
            await reload()
          }}
        />
      )}
    </div>
  )
}

function UserForm({
  user,
  onClose,
  onSaved,
}: {
  user: UserProfile | null
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const isEdit = Boolean(user)

  const [name, setName] = useState(user?.name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [role, setRole] = useState<Role>(user?.role ?? 'employee')
  const [language, setLanguage] = useState(user?.language ?? 'en')
  const [payGroup, setPayGroup] = useState<PayGroup | ''>(user?.pay_group ?? '')
  const [rounding, setRounding] = useState<RoundingMode>(user?.rounding_mode ?? 'cent')
  const [hireDate, setHireDate] = useState(user?.hire_date ?? '')
  const [perms, setPerms] = useState<Permissions>(
    user
      ? { ...defaultPermissions(user.role), ...user.permissions }
      : defaultPermissions('employee'),
  )
  const [showPerms, setShowPerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // When the role changes on a fresh invite, reset flags to the role defaults.
  const roleDefaults = useMemo(() => defaultPermissions(role), [role])
  function onRoleChange(next: Role) {
    setRole(next)
    if (!isEdit) setPerms(defaultPermissions(next))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!name.trim() || !phone.trim()) {
      setErr(t('team.errors.required'))
      return
    }
    // Only send flags that differ from the role defaults (keeps overrides explicit).
    const overrides: Partial<Permissions> = {}
    for (const k of PERMISSION_KEYS) {
      if (perms[k] !== roleDefaults[k]) overrides[k] = perms[k]
    }
    const input: UpsertUserInput = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      role,
      language,
      permissions: overrides,
      pay_group: payGroup || null,
      rounding_mode: rounding,
      hire_date: hireDate || null,
    }
    setBusy(true)
    try {
      if (user) await updateUser(user.id, input)
      else await createUser(input)
      await onSaved()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
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
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl dark:bg-slate-800 sm:rounded-2xl"
      >
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
          {isEdit ? t('team.editTitle') : t('team.inviteTitle')}
        </h2>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="uf-name" className={labelCls}>
              {t('team.name')}
            </label>
            <input id="uf-name" className={field} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="uf-phone" className={labelCls}>
                {t('team.phone')}
              </label>
              <input
                id="uf-phone"
                type="tel"
                className={field}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+15551234567"
              />
            </div>
            <div>
              <label htmlFor="uf-email" className={labelCls}>
                {t('team.email')}
              </label>
              <input
                id="uf-email"
                type="email"
                className={field}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="uf-role" className={labelCls}>
                {t('team.role')}
              </label>
              <select
                id="uf-role"
                className={field}
                value={role}
                onChange={(e) => onRoleChange(e.target.value as Role)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`roles.${r}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="uf-lang" className={labelCls}>
                {t('language.label')}
              </label>
              <select
                id="uf-lang"
                className={field}
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="en">{t('language.en')}</option>
                <option value="es">{t('language.es')}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="uf-paygroup" className={labelCls}>
                {t('team.payGroup')}
              </label>
              <select
                id="uf-paygroup"
                className={field}
                value={payGroup}
                onChange={(e) => setPayGroup(e.target.value as PayGroup | '')}
              >
                <option value="">{t('team.none')}</option>
                {PAY_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {t(`payGroup.${g}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="uf-round" className={labelCls}>
                {t('team.rounding')}
              </label>
              <select
                id="uf-round"
                className={field}
                value={rounding}
                onChange={(e) => setRounding(e.target.value as RoundingMode)}
              >
                {ROUNDING.map((r) => (
                  <option key={r} value={r}>
                    {t(`rounding.${r}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="uf-hire" className={labelCls}>
              {t('team.hireDate')}
            </label>
            <input
              id="uf-hire"
              type="date"
              className={field}
              value={hireDate ?? ''}
              onChange={(e) => setHireDate(e.target.value)}
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowPerms((s) => !s)}
              className="text-sm font-medium text-teal-700 hover:underline dark:text-teal-300"
            >
              {showPerms ? t('team.hidePermissions') : t('team.showPermissions')}
            </button>
            {showPerms && (
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-600">
                {PERMISSION_KEYS.map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={perms[k]}
                      onChange={(e) => setPerms((p) => ({ ...p, [k]: e.target.checked }))}
                      className="rounded border-slate-300"
                    />
                    {t(`permissions.${k}`)}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {err && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
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
      </form>
    </div>
  )
}
