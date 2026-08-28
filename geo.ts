/** Outils géographiques : distance haversine, formatage, cumul d'un parcours */

const EARTH_RADIUS_M = 6_371_000

export interface LatLng {
  lat: number
  lng: number
}

/** Distance à vol d'oiseau entre deux points, en mètres (formule de haversine) */
export function haversine(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const la1 = toRad(a.lat)
  const la2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** « 850 m », « 1,2 km », « 847 km » */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—'
  if (meters < 1000) return `${Math.round(meters)} m`
  const km = meters / 1000
  if (km < 10) return `${km.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
  return `${Math.round(km).toLocaleString('fr-FR')} km`
}

/** Longueur cumulée d'un parcours (points dans l'ordre chronologique), en mètres */
export function totalDistance(points: LatLng[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += haversine(points[i - 1], points[i])
  return total
}

/* ───────────────────── Politique de relevé GPS ─────────────────────
 *
 * Tout ce qui suit décide *quand* on relève une position et *avec quelle
 * précision*. C'est volontairement du calcul pur (pas de DOM, pas d'horloge
 * implicite) : le hook `useLocationSharing` ne fait que brancher ces fonctions
 * sur `navigator.geolocation`, et les tests les prennent telles quelles.
 */

/**
 * Mode de surveillance.
 *  - `high` : GPS, au mètre près, mais gourmand ;
 *  - `low`  : position réseau/wifi, quasi gratuite, à quelques centaines de mètres ;
 *  - `off`  : plus de surveillance du tout.
 */
export type GeoWatchMode = 'high' | 'low' | 'off'

/** Signaux d'usage qui gouvernent la dépense de batterie. */
export interface GeoSignals {
  /** Onglet en arrière-plan (`document.visibilityState === 'hidden'`). */
  hidden: boolean
  /** Écran allumé mais plus un geste depuis un long moment. */
  idle: boolean
}

/**
 * Compromis batterie, dans le même esprit que `useMotionBudget` pour le décor
 * animé : on ne paie le GPS que quand quelqu'un regarde.
 *
 *  - onglet caché : on coupe. Le navigateur nous étrangle de toute façon en
 *    arrière-plan, et un GPS qui tourne écran éteint est le meilleur moyen de
 *    vider une batterie en une après-midi ;
 *  - visible mais inactif depuis longtemps (carte laissée ouverte sur un bureau) :
 *    on retombe en basse précision, ce qui suffit à garder le point vivant ;
 *  - visible et actif : haute précision, c'est le seul moment où la finesse
 *    se voit vraiment.
 */
export function geoWatchMode({ hidden, idle }: GeoSignals): GeoWatchMode {
  if (hidden) return 'off'
  if (idle) return 'low'
  return 'high'
}

/**
 * Options passées à `watchPosition`.
 *
 * `maximumAge` était à 60 s : le navigateur avait le droit de resservir une
 * position vieille d'une minute — à pied, c'est déjà 80 m d'écart. On descend
 * à 5 s en haute précision (on veut un point frais, pas un souvenir) et on
 * tolère 30 s en basse précision, où la position réseau ne bouge de toute façon
 * qu'à l'échelle du quartier.
 *
 * `timeout` augmente en haute précision : un premier verrouillage GPS à froid
 * demande couramment 15 à 20 s. Trop court, on ne récolterait que des erreurs
 * `TIMEOUT` et jamais le point précis qu'on est allé chercher.
 */
export function geoWatchOptions(mode: Exclude<GeoWatchMode, 'off'>): PositionOptions {
  return mode === 'high'
    ? { enableHighAccuracy: true, maximumAge: 5_000, timeout: 25_000 }
    : { enableHighAccuracy: false, maximumAge: 30_000, timeout: 15_000 }
}

/**
 * Précision annoncée (rayon en mètres) au-delà de laquelle un point n'apprend
 * plus rien : c'est une position réseau, pas un point GPS. On la laisse quand
 * même passer si on n'a rien envoyé depuis longtemps — mieux vaut « quelque
 * part dans ce quartier » que « nulle part ».
 */
export const MAX_ACCURACY_M = 120

/** Seuil de déplacement plancher : en dessous, on enregistrerait du bruit. */
export const MIN_MOVE_FLOOR_M = 12
/** Seuil de déplacement plafond, pour les positions les plus floues. */
export const MIN_MOVE_CEIL_M = 60

/**
 * Deux relevés annoncés à ±a mètres peuvent différer d'environ 2a alors qu'on
 * n'a pas bougé d'un pas. On prend 1,5 × la précision annoncée : au-dessus, le
 * déplacement est réel plutôt qu'un tremblement de l'antenne.
 */
const MOVE_FACTOR = 1.5

/**
 * Seuil de déplacement adapté à la précision du relevé, en mètres.
 *
 * L'ancien seuil aveugle de 40 m avalait la moitié d'un trajet à pied. Avec un
 * vrai point GPS (± 8 m), on descend au plancher de 12 m — une quinzaine de pas
 * suffisent à faire bouger le marqueur. Avec un point flou (± 90 m), on remonte
 * jusqu'au plafond de 60 m pour ne pas tracer une marche aléatoire immobile.
 * Précision inconnue : on se méfie, seuil plafond.
 */
export function minMoveDistance(accuracy: number | null | undefined): number {
  if (accuracy == null || !Number.isFinite(accuracy) || accuracy <= 0) return MIN_MOVE_CEIL_M
  return Math.min(MIN_MOVE_CEIL_M, Math.max(MIN_MOVE_FLOOR_M, Math.round(accuracy * MOVE_FACTOR)))
}

/** Dernier point réellement envoyé en base. */
export interface SentFix extends LatLng {
  /** Horodatage de l'envoi, en millisecondes. */
  at: number
}

/** Relevé qui vient d'arriver du navigateur. */
export interface IncomingFix extends LatLng {
  at: number
  accuracy: number | null
}

/** Cadences d'envoi : anti-spam et battement de cœur. */
export interface FixTiming {
  /** Jamais deux envois plus rapprochés que ça. */
  minIntervalMs: number
  /** Au-delà de ce silence, on renvoie un point même immobile. */
  maxSilenceMs: number
}

/**
 * Verdict lisible — utile aux tests et au journal, plutôt qu'un booléen muet.
 * `first`, `moved` et `heartbeat` envoient ; les trois autres retiennent.
 */
export type FixVerdict = 'first' | 'moved' | 'heartbeat' | 'throttled' | 'inaccurate' | 'still'

/** Le verdict conduit-il à écrire un point ? */
export function fixAccepted(verdict: FixVerdict): boolean {
  return verdict === 'first' || verdict === 'moved' || verdict === 'heartbeat'
}

/** Faut-il enregistrer ce relevé, et pourquoi ? */
export function shouldSendFix(prev: SentFix | null, next: IncomingFix, timing: FixTiming): FixVerdict {
  // Rien en mémoire : on prend, même flou. Une carte vide n'aide personne, et
  // le cercle de précision dira honnêtement ce que vaut ce premier point.
  if (!prev) return 'first'

  const since = next.at - prev.at
  if (since < timing.minIntervalMs) return 'throttled'
  const stale = since >= timing.maxSilenceMs

  const { accuracy } = next
  const known = accuracy != null && Number.isFinite(accuracy)
  // Point trop flou : on l'ignore, sauf pour rompre un long silence.
  if (known && accuracy > MAX_ACCURACY_M) return stale ? 'heartbeat' : 'inaccurate'

  if (haversine(prev, next) >= minMoveDistance(known ? accuracy : null)) return 'moved'
  return stale ? 'heartbeat' : 'still'
}
