import { useEffect } from 'react'
import { useConnectivityStore } from '@/stores/connectivityStore'
import { isOnline, resetBackoff } from '@/lib/network'

/**
 * Détecte les coupures réseau et les retours en ligne pour resynchroniser l'app.
 *
 * Cible le cas d'usage réel d'Awy : mobile en mobilité (métro, avion, veille du
 * téléphone). On écoute les signaux fiables et proprement nettoyables :
 *   - `window` `online` / `offline` (perte / retour du réseau) ;
 *   - `document` `visibilitychange` (retour au premier plan après une veille).
 *
 * On ne s'accroche PAS aux callbacks du socket Realtime de Supabase : leur API
 * (`socket.onOpen/onClose`) ne renvoie pas de handle de désinscription, on créerait
 * donc des listeners non nettoyables — contraire au nettoyage exemplaire en place.
 * Les signaux `window`/`document` couvrent le cas mobile de façon fiable, et le
 * rattrapage par re-fetch (reconnectNonce) corrige la donnée périmée quel que soit
 * l'état du socket.
 *
 * Chaque bump du nonce fait re-`load()` une demi-douzaine d'écrans : dans un métro
 * où le réseau clignote, ça suffit à vider une batterie. Les bumps sont donc
 * espacés d'au moins MIN_BUMP_INTERVAL_MS, sans jamais en perdre un (le dernier
 * est reporté à la fin de la fenêtre).
 *
 * À monter UNE SEULE FOIS, au niveau racine (App).
 */

const DEBOUNCE_MS = 250 // coalesce les rafales d'événements online/visibility
const RECONNECT_SETTLE_MS = 1200 // durée d'affichage de « Reconnexion… »
const STALE_HIDDEN_MS = 8000 // veille assez longue → synchro considérée périmée
const MIN_BUMP_INTERVAL_MS = 10_000 // intervalle minimum entre deux rattrapages complets

export function useReconnect() {
  useEffect(() => {
    let settleTimer: ReturnType<typeof setTimeout> | null = null
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let pendingBumpTimer: ReturnType<typeof setTimeout> | null = null
    let lastBumpAt = 0
    let hiddenAt: number | null = null
    let wasOffline = !isOnline()

    // Rattrapage effectif : bump du nonce (les surfaces live re-fetchent) + bannière transitoire.
    const bump = () => {
      pendingBumpTimer = null
      lastBumpAt = Date.now()
      resetBackoff()
      useConnectivityStore.getState().beginReconnect()
      if (settleTimer) clearTimeout(settleTimer)
      settleTimer = setTimeout(() => {
        settleTimer = null
        if (isOnline()) useConnectivityStore.getState().setOnline()
      }, RECONNECT_SETTLE_MS)
    }

    const reconnect = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        if (!isOnline()) return
        const since = Date.now() - lastBumpAt
        if (since >= MIN_BUMP_INTERVAL_MS) {
          bump()
        } else if (!pendingBumpTimer) {
          // Réseau qui clignote : on reporte, sans multiplier les re-fetch.
          pendingBumpTimer = setTimeout(bump, MIN_BUMP_INTERVAL_MS - since)
        }
      }, DEBOUNCE_MS)
    }

    const goOffline = () => {
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
      if (settleTimer) { clearTimeout(settleTimer); settleTimer = null }
      if (pendingBumpTimer) { clearTimeout(pendingBumpTimer); pendingBumpTimer = null }
      useConnectivityStore.getState().setOffline()
    }

    const onOffline = () => { wasOffline = true; goOffline() }
    const onOnline = () => { wasOffline = false; resetBackoff(); reconnect() }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      const hiddenFor = hiddenAt ? Date.now() - hiddenAt : 0
      hiddenAt = null
      if (!isOnline()) {
        goOffline()
      } else if (wasOffline || hiddenFor >= STALE_HIDDEN_MS || useConnectivityStore.getState().status !== 'online') {
        wasOffline = false
        reconnect()
      }
    }

    // État initial : si on démarre hors ligne, on l'affiche tout de suite.
    if (!isOnline()) goOffline()

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (settleTimer) clearTimeout(settleTimer)
      if (debounceTimer) clearTimeout(debounceTimer)
      if (pendingBumpTimer) clearTimeout(pendingBumpTimer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
}
