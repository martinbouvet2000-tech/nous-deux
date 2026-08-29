/**
 * Awy — fonction Edge « ingest-location ».
 *
 * Elle est la porte d’entrée des raccourcis de téléphone (Raccourcis sur iOS,
 * HTTP Shortcuts ou Tasker sur Android). Une application web n’a aucun accès à
 * la position quand elle est fermée : cette porte est le seul moyen pour que la
 * carte d’Awy bouge sans que personne n’ouvre l’app.
 *
 * AUTHENTIFICATION. Pas de JWT (`verify_jwt: false`) : un raccourci de
 * téléphone ne sait pas se connecter, et on ne va pas lui confier un mot de
 * passe. Il présente un jeton long, tiré au hasard, créé depuis les Réglages.
 * La fonction ne le vérifie pas elle-même : elle le passe à
 * `public.enregistrer_position(...)`, qui compare son empreinte SHA-256 à celles
 * en base. Le jeton en clair n’est stocké nulle part.
 *
 * DISCRÉTION. La réponse ne dit jamais si un jeton existe : un 401 sec, sans un
 * mot. Et un jeton valable reçoit toujours la même réponse — `ok` — que le
 * point ait été écrit, écarté parce que le partage est coupé, ou écarté parce
 * qu’il arrive trop tôt. Personne ne peut donc apprendre, en tenant un jeton
 * volé, si la personne partage sa position ni quand elle a bougé.
 *
 * CE QU’UN JETON VOLÉ PERMET. Écrire une position, pour son seul propriétaire.
 * Rien d’autre : la fonction SQL ne renvoie aucune donnée, le `user_id` de
 * l’insertion vient de la ligne du jeton et jamais du corps de la requête, et
 * `profiles.share_location` reste le dernier mot. La parade tient en un bouton :
 * « Révoquer », dans les Réglages.
 *
 * JOURNALISATION. Le strict minimum : un incident serveur, sans jeton, sans
 * coordonnées. Une position est la donnée la plus sensible de l’app ; elle n’a
 * rien à faire dans un journal.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

/** Au-delà, ce n’est plus une position : on refuse sans même lire. */
const TAILLE_MAX_CORPS = 2048

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)

/** Réponses courtes : un raccourci de téléphone n’a que faire d’un corps verbeux. */
const OK = (): Response => new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } })
const REFUS = (): Response => new Response(null, { status: 401 })
const MALFORME = (): Response => new Response(null, { status: 400 })

interface Demande {
  token?: unknown
  lat?: unknown
  lng?: unknown
  accuracy?: unknown
}

/** Accepte un nombre ou sa forme texte : selon les apps, `44.8` part en chaîne. */
function nombre(valeur: unknown): number | null {
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? valeur : null
  if (typeof valeur === 'string' && valeur.trim() !== '') {
    const n = Number(valeur.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response(null, { status: 405 })

  let brut: string
  try {
    brut = await req.text()
  } catch {
    return MALFORME()
  }
  if (brut.length > TAILLE_MAX_CORPS) return MALFORME()

  let demande: Demande
  try {
    demande = JSON.parse(brut) as Demande
  } catch {
    return MALFORME()
  }

  const jeton = typeof demande.token === 'string' ? demande.token.trim() : ''
  // Jeton absent : c’est un 401, comme un jeton faux. On ne distingue pas.
  if (!jeton) return REFUS()

  const lat = nombre(demande.lat)
  const lng = nombre(demande.lng)
  if (lat === null || lng === null) return MALFORME()

  const precision = nombre(demande.accuracy)

  const { data, error } = await admin.rpc('enregistrer_position', {
    jeton,
    lat,
    lng,
    precision_m: precision === null ? null : Math.round(precision),
  })

  if (error) {
    // Ni jeton ni coordonnées ici : seulement de quoi savoir que la base a refusé.
    console.error('[ingest-location] rpc indisponible')
    return new Response(null, { status: 503 })
  }

  // 'jeton_invalide' couvre l’inconnu comme le révoqué : un seul et même 401.
  if (data === 'jeton_invalide') return REFUS()
  if (data === 'coordonnees_invalides') return MALFORME()

  // 'ok', 'partage_coupe', 'trop_frequent' → réponse identique, volontairement.
  return OK()
})
