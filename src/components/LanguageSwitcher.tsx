import { useTranslation } from 'react-i18next'

import { SUPPORTED_LANGUAGES } from '../i18n'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

/**
 * Language switcher. Changes the live UI language and, when the user is signed
 * in, persists the choice to their profile (the source of truth per the spec).
 */
export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const { profile, refreshProfile } = useAuth()

  async function onChange(lang: string) {
    await i18n.changeLanguage(lang)
    if (profile) {
      const { error } = await supabase
        .from('users')
        .update({ language: lang })
        .eq('id', profile.id)
      if (error) console.error('Failed to save language preference:', error.message)
      else await refreshProfile()
    }
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">{t('language.label')}</span>
      <select
        aria-label={t('language.label')}
        value={i18n.resolvedLanguage}
        onChange={(e) => void onChange(e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-800 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {t(`language.${lang}`)}
          </option>
        ))}
      </select>
    </label>
  )
}
