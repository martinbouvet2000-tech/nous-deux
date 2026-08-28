import { createClient } from '@supabase/supabase-js'
import { guardedFetch, isOnline } from '@/lib/network'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  const missing: string[] = []
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL')
  if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY')
  throw new Error(
    `[awy] Variables d'environnement manquantes : ${missing.join(', ')}.\n` +
    `Créez un fichier .env.local à la racine du projet avec :\n` +
    `  VITE_SUPABASE_URL=https://votre-projet.supabase.co\n` +
    `  VITE_SUPABASE_ANON_KEY=sb_publishable_xxx`
  )
}

/** Paliers de reconnexion du socket temps réel (ms) */
const REALTIME_STEPS = [1_000, 2_000, 5_000, 10_000]

/**
 * Toutes les requêtes passent par `guardedFetch` (lib/network) : hors ligne rien
 * n'est émis, les lectures d'affichage retombent sur le cache local, et les
 * échecs réseau successifs sont espacés par un backoff exponentiel.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: guardedFetch },
  realtime: {
    // Sans réseau, marteler le socket toutes les secondes ne fait que vider la
    // batterie : on espace franchement tant que le navigateur se dit hors ligne.
    reconnectAfterMs: (tries: number) =>
      isOnline() ? (REALTIME_STEPS[tries - 1] ?? 10_000) : 30_000,
  },
})
