import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useAuth } from './context/AuthContext'
import AppShell from './components/AppShell'
import Login from './pages/Login'
import Home from './pages/Home'
import Chat from './pages/Chat'
import Team from './pages/Team'
import InstallPrompt from './components/InstallPrompt'
import UpdatePrompt from './components/UpdatePrompt'

export default function App() {
  const { t } = useTranslation()
  const { session, loading, profile } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
        {t('common.loading')}
      </div>
    )
  }

  return (
    <BrowserRouter>
      {session ? (
        <AppShell>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/chat" element={<Chat />} />
            <Route
              path="/team"
              element={profile?.role === 'owner' ? <Team /> : <Navigate to="/" replace />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      ) : (
        <Login />
      )}
      <InstallPrompt />
      <UpdatePrompt />
    </BrowserRouter>
  )
}
