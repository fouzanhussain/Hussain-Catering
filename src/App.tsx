import { useTranslation } from 'react-i18next'

import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Home from './pages/Home'
import InstallPrompt from './components/InstallPrompt'
import UpdatePrompt from './components/UpdatePrompt'

export default function App() {
  const { t } = useTranslation()
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
        {t('common.loading')}
      </div>
    )
  }

  return (
    <>
      {session ? <Home /> : <Login />}
      <InstallPrompt />
      <UpdatePrompt />
    </>
  )
}
