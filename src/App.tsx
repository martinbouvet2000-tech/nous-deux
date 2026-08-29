import { Suspense, lazy, useCallback, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Heart } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { isOnline } from '@/lib/network'
import { useAuthStore } from '@/stores/authStore'
import { useConnectivityStore } from '@/stores/connectivityStore'
import { useToastStore } from '@/lib/toast'
import AppLayout from '@/components/Layout/AppLayout'
import ErrorBoundary from '@/components/ErrorBoundary'
import Toaster from '@/components/ui/Toaster'
import ConfirmDialogHost from '@/components/ui/ConfirmDialog'
import ConnectivityBanner from '@/components/ConnectivityBanner'
import { useReconnect } from '@/hooks/useReconnect'

const Login = lazy(() => import('@/pages/Login'))
const ResetPassword = lazy(() => import('@/pages/ResetPassword'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const CalendarPage = lazy(() => import('@/pages/CalendarPage'))
const MapPage = lazy(() => import('@/pages/MapPage'))
const Memories = lazy(() => import('@/pages/Memories'))
const Activities = lazy(() => import('@/pages/Activities'))
const VideoPage = lazy(() => import('@/pages/VideoPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))

const BASENAME = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/'

/**
 * Délai maximum d'attente de la session avant d'afficher l'app quand même.
 * Hors ligne, la session vient du stockage local : si elle n'est pas là tout de
 * suite, c'est que Supabase tente un rafraîchissement réseau voué à l'échec —
 * inutile d'attendre.
 */
const BOOT_TIMEOUT_MS = 2500
const OFFLINE_BOOT_TIMEOUT_MS = 800

/**
 * Résout la session courante sans jamais déconnecter sur un simple échec réseau :
 * hors ligne, Supabase ne peut pas rafraîchir un jeton et répond « pas de session ».
 * `resolved: false` veut dire « on ne sait pas », surtout pas « déconnecté ».
 */
async function resolveSession(): Promise<{ user: User | null; resolved: boolean }> {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) {
    console.error('[App] getSession error:', error.message)
    if (!session) return { user: null, resolved: false }
  }
  return { user: session?.user ?? null, resolved: true }
}

/**
 * Coquille de l'app : fond, en-tête, silhouette du contenu. Elle s'affiche
 * immédiatement — en ligne comme hors ligne — au lieu du spinner plein écran
 * qui pouvait tourner près de huit secondes avant de laisser un écran noir.
 */
function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-[#110F0E] grain">
      <header className="flex items-center gap-3 px-6 pt-[max(1.75rem,env(safe-area-inset-top))]">
        <Heart size={17} className="text-[#D4A574]/70" fill="currentColor" aria-hidden="true" />
        <span className="font-display text-[17px] tracking-tight text-[#F0EAE0]/95">Awy</span>
      </header>

      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-3" aria-hidden="true">
          <div className="h-28 rounded-3xl bg-[#F0EAE0]/[0.035] motion-safe:animate-pulse" />
          <div className="h-20 rounded-3xl bg-[#F0EAE0]/[0.025] motion-safe:animate-pulse" />
          <div className="h-20 rounded-3xl bg-[#F0EAE0]/[0.02] motion-safe:animate-pulse" />
        </div>
      </div>

      <p className="pb-10 text-center text-sm text-[#9B9287]" role="status" aria-live="polite">
        Chargement…
      </p>
    </div>
  )
}

/**
 * Un toast appartient à la page qui l'a fait naître. À chaque changement d'écran
 * on repart propre : plus d'erreur de géolocalisation qui traîne sur l'agenda —
 * ni, après déconnexion, par-dessus le bouton « S'inscrire ».
 *
 * Les messages nés dans la seconde qui précède sont épargnés : ce sont les
 * confirmations de l'action qui vient justement de faire changer de page
 * (« Mot de passe mis à jour », « Vous êtes liés »).
 */
function ToastRouteScope() {
  const { pathname } = useLocation()
  useEffect(() => {
    useToastStore.getState().clearForNavigation()
  }, [pathname])
  return null
}

export default function App() {
  const { user, loading, applySession, setLoading, fetchProfile } = useAuthStore()

  // Détection globale des coupures / retours réseau (bannière + rattrapage live).
  useReconnect()
  const reconnectNonce = useConnectivityStore((s) => s.reconnectNonce)

  // Profil déjà chargé pour cet utilisateur : évite de redemander `profiles` à
  // chaque événement d'auth (TOKEN_REFRESHED & co) — c'était la source des rafales.
  const profileFetchedFor = useRef<string | null>(null)

  const syncProfile = useCallback(async (u: User | null) => {
    if (!u) {
      profileFetchedFor.current = null
      return
    }
    if (profileFetchedFor.current === u.id) return
    await fetchProfile()
    // On ne mémorise que si le profil est bien arrivé : sinon on retentera au retour du réseau.
    if (useAuthStore.getState().profile?.id === u.id) profileFetchedFor.current = u.id
  }, [fetchProfile])

  // Robinet à toasts : fermé hors session, et purgé net à la déconnexion.
  // Un message déclenché dans l'app ne doit jamais atterrir sur l'écran de connexion.
  useEffect(() => {
    useToastStore.getState().setAuthenticated(!!user)
  }, [user])

  // Notifications push : un navigateur peut faire tourner son abonnement sans
  // prévenir l'app (téléphone restauré, permission réattribuée). On remet la
  // ligne à jour au démarrage, en silence et sans jamais redemander la
  // permission — sinon des notifications s'arrêteraient sans que personne
  // ne s'en aperçoive. Import différé : rien de tout cela n'est dans le
  // chemin critique du premier écran.
  useEffect(() => {
    const id = user?.id
    if (!id) return
    import('@/lib/push')
      .then(({ rafraichirAbonnement }) => rafraichirAbonnement(id))
      .catch(() => { /* confort : son échec ne regarde pas l'utilisateur */ })
  }, [user?.id])

  useEffect(() => {
    let cancelled = false

    // Filet de sécurité : passé ce délai, on rend l'interface avec ce qu'on a.
    const bootTimer = setTimeout(
      () => { if (!cancelled) setLoading(false) },
      isOnline() ? BOOT_TIMEOUT_MS : OFFLINE_BOOT_TIMEOUT_MS,
    )

    const initAuth = async () => {
      try {
        const { user: sessionUser, resolved } = await resolveSession()
        if (cancelled) return
        if (resolved) applySession(sessionUser)
        await syncProfile(useAuthStore.getState().user)
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
      applySession(session?.user ?? null)
      syncProfile(useAuthStore.getState().user).catch((err) => console.error('[App] sync profil:', err))
    })

    return () => {
      cancelled = true
      clearTimeout(bootTimer)
      subscription.unsubscribe()
    }
  }, [applySession, setLoading, syncProfile])

  // Retour du réseau : on rattrape ce qui n'a pas pu se faire pendant la coupure
  // (session restaurée depuis le cache, profil jamais chargé).
  useEffect(() => {
    if (!reconnectNonce || !isOnline()) return
    let cancelled = false

    resolveSession()
      .then(async ({ user: sessionUser, resolved }) => {
        if (cancelled) return
        if (resolved) applySession(sessionUser)
        const current = useAuthStore.getState().user
        if (!current) return
        // Le profil a pu changer pendant la coupure : on le redemande une fois.
        profileFetchedFor.current = null
        await syncProfile(current)
      })
      .catch((err) => console.error('[App] rattrapage session:', err))

    return () => { cancelled = true }
  }, [reconnectNonce, applySession, syncProfile])

  if (loading) return (
    <>
      <ConnectivityBanner />
      <AppShell />
    </>
  )

  return (
    <ErrorBoundary>
      <ConnectivityBanner />
      <BrowserRouter basename={BASENAME}>
        <ToastRouteScope />
        <Suspense fallback={<AppShell />}>
          {user ? (
            <Routes>
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/thoughts" element={<Navigate to="/memories" replace />} />
                <Route path="/map" element={<MapPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/memories" element={<Memories />} />
                <Route path="/activities" element={<Activities />} />
                <Route path="/video" element={<VideoPage />} />
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
