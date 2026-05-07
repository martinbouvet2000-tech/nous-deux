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

export default function App() {
  const { user, setUser, fetchProfile } = useAuthStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile()
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile()
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-text-muted text-sm">Chargement...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <BrowserRouter>
        <Suspense fallback={<div className="min-h-dvh flex items-center justify-center">Chargement...</div>}>
          <Login />
        </Suspense>
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <div className="min-h-dvh flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
            </div>
          </div>
        }
      >
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
