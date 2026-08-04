import { useTranslation } from 'react-i18next'

import { useAuth } from '../context/AuthContext'
import LanguageSwitcher from '../components/LanguageSwitcher'

/** Landing screen after sign-in. Feature modules land here in later phases. */
export default function Home() {
  const { t } = useTranslation()
  const { profile, signOut } = useAuth()

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <span className="text-lg font-semibold text-teal-800 dark:text-teal-300">
          {t('app.name')}
        </span>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <button
            onClick={() => void signOut()}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {t('nav.signOut')}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 p-4">
        {profile ? (
          <>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
              {t('home.welcome', { name: profile.name })}
            </h1>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              {t('home.yourRole')}:{' '}
              <span className="font-medium">{t(`roles.${profile.role}`)}</span>
            </p>

            <section className="mt-6 rounded-xl border border-teal-200 bg-teal-50 p-5 dark:border-teal-900 dark:bg-teal-950/40">
              <h2 className="font-semibold text-teal-900 dark:text-teal-200">
                {t('home.phase0')}
              </h2>
              <p className="mt-1 text-sm text-teal-800 dark:text-teal-300">
                {t('home.phase0Body')}
              </p>
            </section>
          </>
        ) : (
          <div className="mt-10 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {t('home.noProfile')}
          </div>
        )}
      </main>
    </div>
  )
}
