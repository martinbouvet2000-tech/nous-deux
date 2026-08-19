import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { run } from '@/lib/db'
import { toast } from '@/lib/toast'
import { haversine } from '@/lib/geo'
import { useAuthStore } from '@/stores/authStore'

const MIN_DISTANCE_M = 40
const MAX_SILENCE_MS = 3 * 60_000
const MIN_INTERVAL_MS = 45_000

/**
 * Partage de position en arrière-plan : actif seulement si `profile.share_location` est vrai.
 * Envoie un point quand on a bougé d'au moins 40 m ou toutes les 3 min, jamais plus d'un par 45 s.
 * Se coupe quand l'onglet est caché et reprend au retour.
 */
export function useLocationSharing() {
  const profile = useAuthStore((s) => s.profile)
  const userId = profile?.id ?? null
  const enabled = !!profile?.share_location

  const lastSent = useRef<{ lat: number; lng: number; at: number } | null>(null)
  const errorShown = useRef(false)

  useEffect(() => {
    if (!enabled || !userId) return
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return

    let watchId: number | null = null
    let sending = false
    let cancelled = false

    const onPosition = async (pos: GeolocationPosition) => {
      if (cancelled || sending) return
      const now = Date.now()
      const { latitude: lat, longitude: lng, accuracy } = pos.coords
      const prev = lastSent.current
      if (prev) {
        if (now - prev.at < MIN_INTERVAL_MS) return
        const moved = haversine(prev, { lat, lng }) >= MIN_DISTANCE_M
        const stale = now - prev.at >= MAX_SILENCE_MS
        if (!moved && !stale) return
      }
      sending = true
      const { ok } = await run(
        supabase.from('locations').insert({
          user_id: userId,
          lat,
          lng,
          accuracy: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
          recorded_at: new Date(pos.timestamp || now).toISOString(),
        }),
        { silent: true },
      )
      sending = false
      if (ok) lastSent.current = { lat, lng, at: now }
    }

    const onError = (err: GeolocationPositionError) => {
      if (errorShown.current) return
      errorShown.current = true
      if (err.code === err.PERMISSION_DENIED) {
        toast.error('Autorise la localisation dans ton navigateur pour partager ta position.')
      } else {
        toast.error('Impossible de déterminer ta position pour le moment.')
      }
    }

    const start = () => {
      if (watchId !== null) return
      watchId = navigator.geolocation.watchPosition(onPosition, onError, {
        enableHighAccuracy: false,
        maximumAge: 60_000,
        timeout: 20_000,
      })
    }
    const stop = () => {
      if (watchId === null) return
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop()
      else start()
    }

    if (document.visibilityState !== 'hidden') start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [enabled, userId])
}
