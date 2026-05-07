import React, { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import AppLayout from '@/components/Layout/AppLayout'

const Login = lazy(() => import('@/pages/Login'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Thoughts = lazy(() => import('@/pages/Thoughts'))
const CalendarPage = lazy(() => import('@/pages/CalendarPage'))
const Memories = lazy(() => import('@/pages/Memories'))
const Todos = lazy(() => import('@/pages/Todos'))
const Activities = lazy(() => import('@/pages/Activities'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))

const LoadingSpinner = () => (
  <div className="min-h-dvh flex items-center justify-center">
    <div className="text-center">
      <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
      <p className="text-text-muted text-sm">Chargement...</p>
    </div>
  </div>
)

export default function App() {
  const { user, setUser, fetchProfile } = useAuthStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) {
          console.error('[App] getSession error:', error.message)
        }
        if (!cancelled) {
          setUser(session?.user ?? null)
          if (session?.user) {
            await fetchProfile()
          }
          setLoading(false)
        }
      } catch (err) {
        console.error('[App] initAuth unexpected error:', err)
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    initAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        setUser(session?.user ?? null)
        if (session?.user) {
          fetchProfile()
        }
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [setUser, fetchProfile])

  if (loading) {
    return <LoadingSpinner />
  }

  if (!user) {
    return (
      <BrowserRouter>
        <Suspense fallback={<LoadingSpinner />}>
          <Login />
        </Suspense>
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/thoughts" element={<Thoughts />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/memories" element={<Memories />} />
            <Route path="/todos" element={<Todos />} />
            <Route path="/activities" element={<Activities />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
