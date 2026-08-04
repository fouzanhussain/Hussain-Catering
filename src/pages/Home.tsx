import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'

/** Landing screen after sign-in. Feature modules land here in later phases. */
export default function Home() {
  const { t } = useTranslation()
  const { profile } = useAuth()

  if (!profile) {
    return (
      <div className="p-4">
        <div className="mt-10 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {t('home.noProfile')}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
        {t('home.welcome', { name: profile.name })}
      </h1>
      <p className="mt-1 text-slate-600 dark:text-slate-300">
        {t('home.yourRole')}: <span className="font-medium">{t(`roles.${profile.role}`)}</span>
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link
          to="/chat"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
        >
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('nav.chat')}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {t('home.chatBlurb')}
          </p>
        </Link>

        <Link
          to="/attendance"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
        >
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">
            {t('nav.attendance')}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {t('home.attendanceBlurb')}
          </p>
        </Link>

        {profile.role === 'owner' && (
          <Link
            to="/team"
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
          >
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('nav.team')}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {t('home.teamBlurb')}
            </p>
          </Link>
        )}
      </div>

      <section className="mt-6 rounded-xl border border-teal-200 bg-teal-50 p-5 dark:border-teal-900 dark:bg-teal-950/40">
        <h2 className="font-semibold text-teal-900 dark:text-teal-200">{t('home.phase2')}</h2>
        <p className="mt-1 text-sm text-teal-800 dark:text-teal-300">{t('home.phase2Body')}</p>
      </section>
    </div>
  )
}
