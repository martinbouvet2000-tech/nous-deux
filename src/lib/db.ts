import { toast } from '@/lib/toast'

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
 * Exécute une requête Supabase, affiche un toast d'erreur si besoin,
 * et renvoie `{ ok, data }` — plus jamais d'erreur avalée en silence.
 */
export async function run<T>(
  query: PromiseLike<Result<T>>,
  opts: { errorMessage?: string; silent?: boolean } = {},
): Promise<{ ok: boolean; data: T | null; error: unknown }> {
  try {
    const { data, error } = await query
    if (error) {
      console.error('[db]', error)
      if (!opts.silent) toast.error(humanizeError(error, opts.errorMessage))
      return { ok: false, data: null, error }
    }
    return { ok: true, data, error: null }
  } catch (err) {
    console.error('[db] unexpected', err)
    if (!opts.silent) toast.error(humanizeError(err, opts.errorMessage))
    return { ok: false, data: null, error: err }
  }
}
