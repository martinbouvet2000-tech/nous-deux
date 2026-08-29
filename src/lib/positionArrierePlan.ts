/**
 * Position en arrière-plan — la règle du serveur, écrite une fois, en clair.
 *
 * POURQUOI CE FICHIER EXISTE
 * Une application web n’a aucun accès à la position quand elle est fermée : ni
 * sur iPhone, ni sur Android, et un service worker n’a pas le droit d’appeler le
 * GPS. La carte ne bouge donc que si quelqu’un ouvre Awy. Le contournement est
 * un raccourci natif du téléphone (Raccourcis sur iOS, HTTP Shortcuts ou Tasker
 * sur Android) qui envoie la position à Supabase sans ouvrir l’app, avec un
 * jeton créé depuis les Réglages.
 *
 * Ce module tient deux rôles :
 *   1. Il fournit à l’écran des Réglages l’URL exacte et le corps JSON exact à
 *      recopier dans le raccourci — deux boutons « Copier », pas une ligne à
 *      retaper à la main sur un téléphone.
 *   2. Il énonce, en TypeScript testable, la décision que prend
 *      `public.enregistrer_position(...)` côté base. Cette fonction SQL ne peut
 *      pas tourner dans Vitest ; sa règle, elle, est ici, et
 *      `positionArrierePlan.test.ts` vérifie à la fois ce code ET la migration,
 *      pour que les deux ne divergent jamais. Même méthode que
 *      `pushMessages.ts` avec la migration des notifications.
 *
 * MODÈLE DE SÉCURITÉ — un jeton volé ne permet QUE d’écrire une position pour
 * son propre propriétaire. Jamais d’en lire une, jamais d’atteindre l’autre :
 * le `user_id` de l’insertion vient de la ligne du jeton, jamais de la requête,
 * et la fonction SQL ne renvoie qu’un code d’état.
 */

/** Les cinq issues possibles d’un appel, mot pour mot celles de la fonction SQL. */
export type CodeEnregistrement =
  | 'ok'
  | 'jeton_invalide'
  | 'coordonnees_invalides'
  | 'partage_coupe'
  | 'trop_frequent'

/** Un point par minute au maximum. Une automatisation horaire n’y touche jamais. */
export const DELAI_ANTI_SPAM_MS = 60_000

/** Bornes terrestres. Au-delà, ce n’est pas un lieu, c’est une faute de frappe. */
export const LAT_MAX = 90
export const LNG_MAX = 180

/** Longueur de l’étiquette d’un jeton, alignée sur la contrainte SQL. */
export const ETIQUETTE_MAX = 40

/** Préfixe des jetons émis par `creer_jeton_position` : « awy_ » + 48 hexadécimaux. */
export const PREFIXE_JETON = 'awy_'

/**
 * L’adresse à appeler depuis le téléphone. Dérivée de l’URL du projet Supabase
 * pour qu’un environnement de test ne pointe jamais vers la production.
 */
const BASE_SUPABASE = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').replace(/\/+$/, '')
export const URL_INGESTION = `${BASE_SUPABASE}/functions/v1/ingest-location`

/** Coordonnées d’exemple : Varsovie, là où vit une moitié de ce couple. */
const EXEMPLE = { lat: 52.2297, lng: 21.0122, accuracy: 12 }

/**
 * Le corps JSON exact, prêt à coller. `accuracy` est facultatif — on le laisse
 * dans l’exemple parce qu’une position sans marge d’erreur se lit mal sur une
 * carte, et que tous les téléphones savent la donner.
 */
export function corpsJsonExemple(jeton: string): string {
  return JSON.stringify(
    { token: jeton, lat: EXEMPLE.lat, lng: EXEMPLE.lng, accuracy: EXEMPLE.accuracy },
    null,
    2,
  )
}

/** Étiquette d’un jeton : coupée à la longueur acceptée par la base, jamais vide. */
export function nettoyerEtiquette(valeur: string): string | null {
  const propre = valeur.trim().slice(0, ETIQUETTE_MAX)
  return propre.length > 0 ? propre : null
}

/** Ce que la base sait d’un jeton et de son propriétaire au moment de l’appel. */
export interface ContexteEnregistrement {
  /** Jeton présenté dans le corps de la requête. */
  jeton: string | null
  /** Empreinte trouvée en base ? `null` si le jeton est inconnu. */
  jetonConnu: boolean
  /** Date de révocation, si le jeton a été coupé depuis les Réglages. */
  revoqueLe: Date | null
  lat: number | null
  lng: number | null
  /** `profiles.share_location` du propriétaire du jeton. */
  partageActif: boolean
  /** Dernier point déjà enregistré pour cette personne, ou `null`. */
  dernierPointLe: Date | null
  maintenant: Date
}

/** Bornes de coordonnées, NaN et infinis compris. */
export function coordonneesValides(lat: number | null, lng: number | null): boolean {
  if (lat === null || lng === null) return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  return lat >= -LAT_MAX && lat <= LAT_MAX && lng >= -LNG_MAX && lng <= LNG_MAX
}

/**
 * La décision du serveur, dans l’ordre exact de la fonction SQL.
 *
 * Le jeton passe en premier, délibérément : un appel sans jeton valable ne doit
 * rien pouvoir apprendre du reste — ni qu’une personne partage sa position, ni
 * quand elle a bougé pour la dernière fois.
 */
export function decisionEnregistrement(ctx: ContexteEnregistrement): CodeEnregistrement {
  // 1. Le jeton. Inconnu et révoqué donnent la même réponse : rien à en tirer.
  if (!ctx.jeton || ctx.jeton.length < 16) return 'jeton_invalide'
  if (!ctx.jetonConnu || ctx.revoqueLe !== null) return 'jeton_invalide'

  // 2. Les coordonnées.
  if (!coordonneesValides(ctx.lat, ctx.lng)) return 'coordonnees_invalides'

  // 3. Le réglage de l’app a le dernier mot : partage coupé, rien n’est écrit.
  if (!ctx.partageActif) return 'partage_coupe'

  // 4. Anti-spam : un point par minute au maximum.
  if (ctx.dernierPointLe && ctx.maintenant.getTime() - ctx.dernierPointLe.getTime() < DELAI_ANTI_SPAM_MS) {
    return 'trop_frequent'
  }

  return 'ok'
}

/**
 * La réponse HTTP que la fonction Edge renvoie au téléphone.
 *
 * Les trois issues d’un jeton valable — écrit, partage coupé, trop tôt —
 * partagent le même 200. C’est voulu : quelqu’un qui tiendrait un jeton volé ne
 * doit pas pouvoir déduire de la réponse si l’autre partage sa position.
 */
export function statutHttp(code: CodeEnregistrement): number {
  if (code === 'jeton_invalide') return 401
  if (code === 'coordonnees_invalides') return 400
  return 200
}
