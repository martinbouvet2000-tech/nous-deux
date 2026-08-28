import { create } from 'zustand'
import { CACHE_KEYS, readCache, writeCache } from '@/lib/offlineCache'

/**
 * État de connectivité / synchro « temps réel » partagé par toute l'app.
 *
 * - `status` pilote la bannière globale (voir ConnectivityBanner). Il part de
 *   l'état RÉEL du navigateur : si l'app est ouverte hors ligne, la bannière est
 *   là dès la première image, sans attendre le moindre événement.
 * - `reconnectNonce` est un compteur incrémenté à CHAQUE reconnexion. Les surfaces
 *   « live » (dispo, humeur, carte, bannière d'emploi du temps) l'ajoutent aux
 *   dépendances d'un petit effet de rattrapage pour re-`load()` leurs données —
 *   les événements Realtime manqués pendant la coupure ou la veille sont ainsi
 *   récupérés, sans toucher aux abonnements existants ni à leur nettoyage.
 * - `lastSyncAt` est l'horodatage de la dernière réponse obtenue du serveur. Il
 *   survit aux rechargements (cache local) pour pouvoir dire, hors ligne,
 *   à quel point les données affichées sont datées.
 */
export type SyncStatus = 'online' | 'offline' | 'reconnecting'

interface ConnectivityState {
  status: SyncStatus
  reconnectNonce: number
  /** Dernière réponse reçue du serveur (ms), ou null si on n'a jamais synchronisé */
  lastSyncAt: number | null
  /** Coupure détectée (offline, ou onglet caché sans réseau). */
  setOffline: () => void
  /** Retour en ligne : déclenche le rattrapage (bump du nonce) puis affiche « Reconnexion… ». */
  beginReconnect: () => void
  /** Rattrapage terminé : masque la bannière. */
  setOnline: () => void
  /** Une réponse serveur vient d'arriver : les données à l'écran sont fraîches. */
  markSynced: (at?: number) => void
}

/** État de départ : on fait confiance au navigateur plutôt qu'à un optimisme par défaut. */
const initialStatus: SyncStatus =
  typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online'

const initialSync = readCache<number>(CACHE_KEYS.lastSync)

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  status: initialStatus,
  reconnectNonce: 0,
  lastSyncAt: initialSync?.data ?? null,
  setOffline: () =>
    set((s) => (s.status === 'offline' ? s : { ...s, status: 'offline' })),
  beginReconnect: () =>
    set((s) => ({ ...s, status: 'reconnecting', reconnectNonce: s.reconnectNonce + 1 })),
  setOnline: () =>
    set((s) => (s.status === 'online' ? s : { ...s, status: 'online' })),
  markSynced: (at = Date.now()) => {
    writeCache(CACHE_KEYS.lastSync, at)
    set((s) => ({ ...s, lastSyncAt: at }))
  },
}))
