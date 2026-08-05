import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useAuth } from './context/AuthContext'
import AppShell from './components/AppShell'
import InstallPrompt from './components/InstallPrompt'
import UpdatePrompt from './components/UpdatePrompt'

// Route-split so each screen loads on demand (NFR §8: small bundles, works on
// a 3-year-old Android phone on venue Wi-Fi).
const Login = lazy(() => import('./pages/Login'))
const Home = lazy(() => import('./pages/Home'))
const Chat = lazy(() => import('./pages/Chat'))
const Attendance = lazy(() => import('./pages/Attendance'))
const Events = lazy(() => import('./pages/Events'))
const Payroll = lazy(() => import('./pages/Payroll'))
const Advances = lazy(() => import('./pages/Advances'))
const Team = lazy(() => import('./pages/Team'))

function Loading() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
      {t('common.loading')}
    </div>
  )
}

export default function App() {
  const { session, loading, profile } = useAuth()

  if (loading) return <Loading />

  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        {session ? (
          <AppShell>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/attendance" element={<Attendance />} />
              <Route path="/events" element={<Events />} />
              <Route path="/payroll" element={<Payroll />} />
              <Route path="/advances" element={<Advances />} />
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
      </Suspense>
      <InstallPrompt />
      <UpdatePrompt />
    </BrowserRouter>
  )
}
