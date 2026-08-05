import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useAuth } from '../context/AuthContext'
import { hasPermission } from '../lib/types'
import LanguageSwitcher from './LanguageSwitcher'
import NotificationsBell from './NotificationsBell'

/** App chrome: header (brand, language, sign-out) and primary navigation. */
export default function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { profile, signOut } = useAuth()
  const isOwner = profile?.role === 'owner'
  const canVendors = isOwner || hasPermission(profile, 'manage_vendors')
  const canCash = isOwner || hasPermission(profile, 'log_cash')

  const navItems = [
    { to: '/', label: t('nav.home'), end: true },
    { to: '/chat', label: t('nav.chat'), end: false },
    { to: '/attendance', label: t('nav.attendance'), end: false },
    { to: '/events', label: t('nav.events'), end: false },
    { to: '/payroll', label: t('nav.payroll'), end: false },
    { to: '/advances', label: t('nav.advances'), end: false },
    ...(canVendors ? [{ to: '/vendors', label: t('nav.vendors'), end: false }] : []),
    ...(canCash ? [{ to: '/cash', label: t('nav.cash'), end: false }] : []),
    { to: '/inventory', label: t('nav.inventory'), end: false },
    ...(isOwner ? [{ to: '/team', label: t('nav.team'), end: false }] : []),
  ]

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'rounded-md px-3 py-2 text-sm font-medium transition-colors',
      isActive
        ? 'bg-teal-700 text-white'
        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700',
    ].join(' ')

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 dark:bg-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-700 dark:bg-slate-800/90">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <span className="truncate text-lg font-semibold text-teal-800 dark:text-teal-300">
            {t('app.name')}
          </span>
          <div className="flex items-center gap-2">
            <NotificationsBell />
            <LanguageSwitcher />
            <button
              onClick={() => void signOut()}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {t('nav.signOut')}
            </button>
          </div>
        </div>
        <nav className="mx-auto flex w-full max-w-5xl gap-1 px-3 pb-2">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1">{children}</main>
    </div>
  )
}
