import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { run } from '@/lib/db'
import { toast } from '@/lib/toast'
import {
  fixAccepted,
  geoWatchMode,
  geoWatchOptions,
  shouldSendFix,
  type GeoWatchMode,
  type SentFix,
} from '@/lib/geo'
import { IDLE_DELAY_MS } from '@/hooks/useMotionBudget'
import { useAuthStore } from '@/stores/authStore'

/** Au-delà de ce silence, on renvoie un point même immobile : le marqueur reste vivant. */
const MAX_SILENCE_MS = 3 * 60_000
/** Anti-spam : jamais deux écritures plus rapprochées que ça. */
const MIN_INTERVAL_MS = 30_000

/**
 * Fenêtre d'inactivité avant de lever le pied sur le GPS.
 *
 * On reprend l'horloge du décor animé (`useMotionBudget`) pour rester cohérent,
 * mais quatre fois plus longue : on peut très bien marcher, carte à l'écran,
 * sans toucher son téléphone pendant une minute. Couper la précision au bout de
 * 30 s serait ressenti comme une régression.
 */
export const GEO_IDLE_MS = 4 * IDLE_DELAY_MS

/** Gestes qui témoignent d'une présence devant l'écran. */
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

/**
 * Partage de position en arrière-plan : actif seulement si `profile.share_location` est vrai.
 *
 * Précision : haute (GPS) quand l'app est visible et qu'on s'en sert, basse
 * (réseau) après une longue inactivité, coupée quand l'onglet passe en
 * arrière-plan — voir `geoWatchMode`. Un point part quand on a bougé plus que
 * la précision annoncée ne l'explique (voir `shouldSendFix`), ou toutes les
 * 3 min, jamais plus d'un toutes les 30 s.
 */
export function useLocationSharing() {
  const profile = useAuthStore((s) => s.profile)
  const userId = profile?.id ?? null
  const enabled = !!profile?.share_location

  const lastSent = useRef<SentFix | null>(null)
  const errorShown = useRef(false)

  useEffect(() => {
    if (!enabled || !userId) return
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return

    let watchId: number | null = null
    let mode: GeoWatchMode = 'off'
    let sending = false
    let cancelled = false
    // Autorisation refusée : inutile de relancer la surveillance au retour de l'onglet.
    let denied = false
    let lastActivity = Date.now()
    let idleTimer: ReturnType<typeof setTimeout> | undefined

    const onPosition = async (pos: GeolocationPosition) => {
      if (cancelled || sending) return
      const now = Date.now()
      const { latitude: lat, longitude: lng, accuracy } = pos.coords
      const acc = Number.isFinite(accuracy) ? accuracy : null
      const verdict = shouldSendFix(
        lastSent.current,
        { lat, lng, at: now, accuracy: acc },
        { minIntervalMs: MIN_INTERVAL_MS, maxSilenceMs: MAX_SILENCE_MS },
      )
      if (!fixAccepted(verdict)) return

      sending = true
      const { ok } = await run(
        supabase.from('locations').insert({
          user_id: userId,
          lat,
          lng,
          accuracy: acc != null ? Math.round(acc) : null,
          recorded_at: new Date(pos.timestamp || now).toISOString(),
        }),
        { silent: true },
      )
      sending = false
      if (ok) lastSent.current = { lat, lng, at: now }
    }

    const stop = () => {
      if (watchId === null) return
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }

    const onError = (err: GeolocationPositionError) => {
      // Position momentanément indisponible (tunnel, GPS qui cherche, délai dépassé) :
      // le prochain point repartira tout seul. Un toast ici n'apprend rien et
      // survivait jusque sur d'autres écrans — on se contente du journal.
      if (err.code !== err.PERMISSION_DENIED) {
        console.warn('[geo] position indisponible:', err.message)
        return
      }
      // Refus d'autorisation : là, c'est actionnable, et une seule fois suffit.
      // La clé de dédoublonnage évite qu'un `watchPosition` bavard n'en empile plusieurs.
      denied = true
      mode = 'off'
      stop()
      if (errorShown.current) return
      errorShown.current = true
      toast.error('Autorise la localisation dans ton navigateur pour partager ta position.', {
        key: 'geo-permission',
      })
    }

    /** (Re)cale la surveillance sur le mode que méritent visibilité et activité. */
    const apply = () => {
      if (cancelled) return
      const next: GeoWatchMode = denied
        ? 'off'
        : geoWatchMode({
            hidden: document.visibilityState === 'hidden',
            idle: Date.now() - lastActivity >= GEO_IDLE_MS,
          })
      if (next === mode && (next === 'off' || watchId !== null)) return
      mode = next
      stop()
      if (next === 'off') return
      watchId = navigator.geolocation.watchPosition(onPosition, onError, geoWatchOptions(next))
    }

    // Un seul minuteur, ré-armé pour le temps restant s'il se déclenche trop tôt :
    // aucun `setTimeout` par mouvement de souris.
    const armIdle = () => {
      const remaining = GEO_IDLE_MS - (Date.now() - lastActivity)
      if (remaining <= 0) {
        apply() // devenu inactif : on lève le pied, le prochain geste relancera
        return
      }
      idleTimer = setTimeout(armIdle, remaining)
    }

    const onActivity = () => {
      const wasIdle = Date.now() - lastActivity >= GEO_IDLE_MS
      lastActivity = Date.now()
      if (!wasIdle) return
      if (idleTimer) clearTimeout(idleTimer)
      armIdle()
      apply() // retour de l'utilisateur : on remonte tout de suite en haute précision
    }

    const onVisibility = () => {
      // Revenir sur l'onglet est en soi un signe de présence : on repart d'une
      // fenêtre d'inactivité neuve plutôt que de reprendre en basse précision.
      if (document.visibilityState !== 'hidden') {
        lastActivity = Date.now()
        if (idleTimer) clearTimeout(idleTimer)
        armIdle()
      }
      apply()
    }

    document.addEventListener('visibilitychange', onVisibility)
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, onActivity, { passive: true })
    armIdle()
    apply()

    return () => {
      cancelled = true
      if (idleTimer) clearTimeout(idleTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onActivity)
      stop()
    }
  }, [enabled, userId])
}
