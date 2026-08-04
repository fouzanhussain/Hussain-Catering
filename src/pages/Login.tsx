import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { supabase, isSupabaseConfigured } from '../lib/supabase'
import LanguageSwitcher from '../components/LanguageSwitcher'

type Step = 'phone' | 'code'

/** Phone OTP sign-in, per spec §4.1 (invite by phone → Supabase phone OTP). */
export default function Login() {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function normalizePhone(raw: string): string {
    // Keep a leading + and digits only; Supabase expects E.164.
    const trimmed = raw.trim()
    const digits = trimmed.replace(/[^\d]/g, '')
    return trimmed.startsWith('+') ? `+${digits}` : `+${digits}`
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const normalized = normalizePhone(phone)
    if (normalized.replace(/\D/g, '').length < 8) {
      setError(t('auth.errors.phoneRequired'))
      return
    }
    setBusy(true)
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: normalized })
    setBusy(false)
    if (otpError) {
      setError(otpError.message || t('auth.errors.generic'))
      return
    }
    setPhone(normalized)
    setStep('code')
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (code.trim().length < 4) {
      setError(t('auth.errors.codeRequired'))
      return
    }
    setBusy(true)
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone,
      token: code.trim(),
      type: 'sms',
    })
    setBusy(false)
    if (verifyError) {
      setError(verifyError.message || t('auth.errors.generic'))
    }
    // On success, AuthContext's onAuthStateChange handles the redirect.
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 dark:bg-slate-900">
      <header className="flex items-center justify-between p-4">
        <span className="text-lg font-semibold text-teal-800 dark:text-teal-300">
          {t('app.name')}
        </span>
        <LanguageSwitcher />
      </header>

      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
            {t('auth.signInTitle')}
          </h1>

          {!isSupabaseConfigured && (
            <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
            </p>
          )}

          {step === 'phone' ? (
            <form onSubmit={sendCode} className="mt-4 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {t('auth.signInSubtitle')}
              </p>
              <div>
                <label
                  htmlFor="phone"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  {t('auth.phoneLabel')}
                </label>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('auth.phonePlaceholder')}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={busy || !isSupabaseConfigured}
                className="w-full rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {busy ? t('auth.sending') : t('auth.sendCode')}
              </button>
            </form>
          ) : (
            <form onSubmit={verify} className="mt-4 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {t('auth.codeSent', { phone })}
              </p>
              <div>
                <label
                  htmlFor="code"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  {t('auth.codeLabel')}
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={t('auth.codePlaceholder')}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 tracking-widest text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {busy ? t('auth.verifying') : t('auth.verify')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('phone')
                  setCode('')
                  setError(null)
                }}
                className="w-full text-center text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                {t('auth.changeNumber')}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
