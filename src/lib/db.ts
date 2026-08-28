import { toast } from '@/lib/toast'
import { isOnline } from '@/lib/network'
import { useConnectivityStore } from '@/stores/connectivityStore'

/**
 * Message lisible pour un utilisateur à partir d'une erreur Supabase/PostgREST.
 * On ne montre jamais un message technique brut sauf en dev.
 */
export function humanizeError(err: unknown, fallback = 'Une erreur est survenue. Réessaie dans un instant.'): string {
  const e = err as { message?: string; code?: string; details?: string } | null
  if (!e) return fallback
  const msg = e.message ?? ''
  const code = e.code ?? ''

  // Messages métier levés par nos fonctions SQL (RAISE EXCEPTION) → on les affiche tels quels
  if (code === 'P0001' && msg) return msg

  if (code === '23505') return 'Cet élément existe déjà.'
  if (code === '23514') return 'Valeur invalide (vérifie les dates ou la longueur du texte).'
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) return "Tu n'as pas le droit de faire ça."
  if (code === 'PGRST116') return 'Élément introuvable.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Pas de connexion. Vérifie ton réseau.'
  if (/JWT|token|session/i.test(msg)) return 'Ta session a expiré. Reconnecte-toi.'
  if (/rate limit/i.test(msg)) return 'Trop de tentatives, réessaie dans quelques minutes.'
  if (/Invalid login credentials/i.test(msg)) return 'Email ou mot de passe incorrect.'
  if (/Email not confirmed/i.test(msg)) return 'Confirme ton email avant de te connecter (regarde tes spams).'
  if (/User already registered/i.test(msg)) return 'Un compte existe déjà avec cet email.'
  if (/Password should be at least/i.test(msg)) return 'Mot de passe trop court (8 caractères minimum).'
  if (/weak|pwned|compromised/i.test(msg)) return 'Ce mot de passe est trop faible ou a fuité. Choisis-en un autre.'
  if (/same password/i.test(msg)) return "Le nouveau mot de passe doit être différent de l'ancien."

  if (import.meta.env.DEV && msg) return msg
  return fallback
}

interface Result<T> {
  data: T | null
  error: unknown
}

/**
 * Hors ligne, la bannière globale (ConnectivityBanner) dit déjà tout : « Hors
 * ligne — dernières infos il y a 5 min ». Empiler par-dessus un toast par écran
 * qui échoue ne renseignait personne et en affichait jusqu'à quatre d'affilée.
 * On se tait donc pendant la coupure ; la déduplication de `lib/toast` suffit
 * pour le cas limite « réseau annoncé présent mais injoignable ».
 */
function offlineSilence(): boolean {
  return !isOnline() || useConnectivityStore.getState().status === 'offline'
}

/**
 * Exécute une requête Supabase et renvoie `{ ok, data, error }` — plus jamais
 * d'erreur avalée en silence. Un toast est affiché sauf si `silent` est demandé
 * ou si l'on est hors ligne (la bannière globale s'en charge déjà).
 * L'appelant qui veut son propre message garde `error` sous la main et peut le
 * traduire avec `humanizeError`.
 */
export async function run<T>(
  query: PromiseLike<Result<T>>,
  opts: { errorMessage?: string; silent?: boolean } = {},
): Promise<{ ok: boolean; data: T | null; error: unknown }> {
  try {
    const { data, error } = await query
    if (error) {
      // Un échec attendu (appel `silent`) ou une simple coupure réseau n'a rien à
      // faire dans la console : hors ligne, la bannière dit déjà tout, et empiler
      // « [db] OfflineError: pas de connexion » à chaque écran ne renseignait personne.
      if (!opts.silent && !offlineSilence()) {
        console.error('[db]', error)
        toast.error(humanizeError(error, opts.errorMessage))
      }
      return { ok: false, data: null, error }
    }
    return { ok: true, data, error: null }
  } catch (err) {
    if (!opts.silent && !offlineSilence()) {
      console.error('[db] unexpected', err)
      toast.error(humanizeError(err, opts.errorMessage))
    }
    return { ok: false, data: null, error: err }
  }
}
