import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import AppLayout from '@/components/Layout/AppLayout'
import ErrorBoundary from '@/components/ErrorBoundary'
import Toaster from '@/components/ui/Toaster'
import ConfirmDialogHost from '@/components/ui/ConfirmDialog'

const Login = lazy(() => import('@/pages/Login'))
const ResetPassword = lazy(() => import('@/pages/ResetPassword'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Thoughts = lazy(() => import('@/pages/Thoughts'))
const CalendarPage = lazy(() => import('@/pages/CalendarPage'))
const Memories = lazy(() => import('@/pages/Memories'))
const Activities = lazy(() => import('@/pages/Activities'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))

const BASENAME = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/'

const LoadingSpinner = () => (
  <div className="min-h-dvh flex items-center justify-center" role="status" aria-live="polite">
    <div className="text-center">
      <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
      <p className="text-text-muted text-sm">Chargement…</p>
    </div>
  </div>
)

export default function App() {
  const { user, loading, setUser, setLoading, fetchProfile } = useAuthStore()

  useEffect(() => {
    let cancelled = false

    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) console.error('[App] getSession error:', error.message)
        if (cancelled) return
        setUser(session?.user ?? null)
        if (session?.user) await fetchProfile()
      } catch (err) {
        console.error('[App] initAuth unexpected error:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    initAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (event === 'PASSWORD_RECOVERY') {
        // Lien de réinitialisation cliqué : on force la page dédiée
        const target = `${BASENAME === '/' ? '' : BASENAME}/reset-password`
        if (!window.location.pathname.endsWith('/reset-password')) window.history.replaceState(null, '', target)
      }
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile()
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [setUser, setLoading, fetchProfile])

  if (loading) return <LoadingSpinner />

  return (
    <ErrorBoundary>
      <BrowserRouter basename={BASENAME}>
        <Suspense fallback={<LoadingSpinner />}>
          {user ? (
            <Routes>
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/thoughts" element={<Thoughts />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/memories" element={<Memories />} />
                <Route path="/activities" element={<Activities />} />
                <Route path="/todos" element={<Navigate to="/activities?tab=projects" replace />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          ) : (
            <Routes>
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="*" element={<Login />} />
            </Routes>
          )}
        </Suspense>
      </BrowserRouter>
      <Toaster />
      <ConfirmDialogHost />
    </ErrorBoundary>
  )
}
