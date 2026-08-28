import { useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useConnectivityStore } from '@/stores/connectivityStore'

/**
 * Le trio « charger + s'abonner au temps réel + recharger à la reconnexion ».
 *
 * Ce motif était recopié à l'identique dans une douzaine de pages et de widgets,
 * avec à chaque fois une variante : ici le rattrapage après une coupure, là non ;
 * ici un `removeChannel` dans le nettoyage, là un `clearInterval` en plus. Ce hook
 * en fait UN seul endroit, sans rien inventer :
 *
 *  - la requête part par les fonctions `load` existantes (elles gardent leur
 *    `run()`, leurs messages d'erreur et leurs `setState`) ;
 *  - le réseau reste gouverné par `lib/network` (`guardedFetch`) : hors ligne rien
 *    ne part, les lectures d'affichage retombent sur le cache local. On appelle donc
 *    `load()` même hors ligne — c'est ce qui permet de réafficher les données datées ;
 *  - le rattrapage réutilise `reconnectNonce` (stores/connectivityStore), incrémenté
 *    par `useReconnect` au plus une fois toutes les 10 s ;
 *  - le canal est retiré au démontage, comme avant : aucune fuite.
 *
 * Deux gardes utiles au passage, gratuites une fois le code partagé :
 *  - le nonce n'est pris en compte que s'il a AUGMENTÉ depuis le dernier rendu.
 *    Les effets copiés-collés (`if (reconnectNonce) load()`) refetchaient à chaque
 *    changement d'identité de `load` dès qu'une reconnexion avait eu lieu, en plus
 *    du chargement initial : un double appel pour la même donnée ;
 *  - un `load` qui échoue est journalisé, jamais transformé en rejet non géré, et
 *    n'empêche pas l'abonnement de se faire.
 */

export interface LiveDataOptions {
  /**
   * Fonction de chargement (initial et rattrapage). Doit être stable
   * (`useCallback`) : son identité pilote le rechargement et le ré-abonnement,
   * exactement comme dans les effets qu'elle remplace.
   */
  load: () => void | Promise<void>
  /** Rien à faire tant que c'est faux (profil pas encore chargé, par exemple). */
  enabled?: boolean
  /**
   * Nom du canal Realtime — inchangé par rapport à l'existant. `null` (ou absent)
   * quand il n'y a rien à écouter : le chargement a quand même lieu.
   */
  channel?: string | null
  /**
   * Branche les écoutes (`.on('postgres_changes', …)`) sur le canal. Rappelée à
   * chaque abonnement ; son identité, elle, ne déclenche jamais de ré-abonnement
   * (c'est le rôle de `channel`, `load` et `rebindKey`).
   */
  bind?: (channel: RealtimeChannel) => void
  /**
   * Clé supplémentaire de ré-abonnement, quand les écoutes dépendent d'une valeur
   * absente du nom du canal et de `load` (typiquement l'identifiant du partenaire).
   */
  rebindKey?: string | number | null
  /** Recharger au retour du réseau (défaut : oui). */
  reconnect?: boolean
}

/** Un `load` qui échoue ne doit ni casser l'abonnement, ni finir en rejet non géré. */
function safeLoad(load: () => void | Promise<void>): void {
  try {
    const result = load()
    if (result && typeof (result as Promise<void>).catch === 'function') {
      void (result as Promise<void>).catch((err) => console.error('[live] chargement', err))
    }
  } catch (err) {
    console.error('[live] chargement', err)
  }
}

export function useLiveData({
  load,
  enabled = true,
  channel = null,
  bind,
  rebindKey = null,
  reconnect = true,
}: LiveDataOptions): void {
  // `bind` est presque toujours une fonction fléchée créée au rendu : on la relit
  // depuis une ref au moment de l'abonnement plutôt que d'en faire une dépendance.
  const bindRef = useRef(bind)
  useEffect(() => {
    bindRef.current = bind
  })

  useEffect(() => {
    if (!enabled) return
    safeLoad(load)
    if (!channel) return
    const ch = supabase.channel(channel)
    bindRef.current?.(ch)
    ch.subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [enabled, channel, rebindKey, load])

  // Rattrapage : les événements Realtime manqués pendant une coupure ou une veille
  // ne réapparaissent pas seuls — on relit une fois, au retour du réseau.
  const reconnectNonce = useConnectivityStore((s) => s.reconnectNonce)
  const seenNonce = useRef(reconnectNonce)
  useEffect(() => {
    const previous = seenNonce.current
    seenNonce.current = reconnectNonce
    if (!reconnect || !enabled) return
    if (reconnectNonce === previous) return
    safeLoad(load)
  }, [reconnectNonce, reconnect, enabled, load])
}
