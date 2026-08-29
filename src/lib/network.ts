/**
 * Garde-fou réseau posé DEVANT toutes les requêtes Supabase (voir lib/supabase).
 *
 * Trois rôles, tous pensés pour le mobile en mobilité (métro, avion, veille) :
 *
 *  1. Hors ligne, on n'émet plus AUCUNE requête. Avant, chaque écran retentait sa
 *     lecture en boucle : une quinzaine d'appels `profiles` en 20 s, la radio du
 *     téléphone allumée pour rien. Maintenant l'appel échoue immédiatement.
 *  2. Coupe-circuit à backoff exponentiel plafonné : après deux échecs réseau
 *     d'affilée (réseau « en ligne » mais injoignable : captive portal, 3G morte),
 *     on laisse le réseau tranquille 1 s, 2 s, 4 s… jusqu'à 30 s.
 *  3. Cache de lecture : les dernières réponses des tables d'affichage (profils,
 *     humeur, dispo) sont relues depuis le cache local quand le réseau manque —
 *     l'écran montre des données datées plutôt que rien.
 *
 * Les écritures ne sont jamais rejouées depuis le cache : hors ligne elles
 * échouent franchement, en silence — c'est la bannière hors-ligne qui informe,
 * pas une avalanche de messages (voir le garde-fou dans `lib/db.run`).
 */

import { readCache, writeCache } from '@/lib/offlineCache'
import { useConnectivityStore } from '@/stores/connectivityStore'

/** Délai maximum d'une lecture avant abandon (les envois de fichiers en sont exclus) */
const REQUEST_TIMEOUT_MS = 10_000
const BASE_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000
/** Nombre d'échecs réseau avant d'ouvrir le coupe-circuit */
const FAILURES_BEFORE_BACKOFF = 2

/** Tables dont on garde la dernière lecture pour l'affichage hors ligne */
const CACHEABLE_TABLES = new Set(['profiles', 'availability', 'moods'])
const REST_TABLE = /\/rest\/v1\/([A-Za-z0-9_]+)/

/** Fréquence maximale d'horodatage de la dernière synchro */
const SYNC_MARK_INTERVAL_MS = 20_000

let failures = 0
let blockedUntil = 0

/** Le navigateur nous dit-il qu'on a du réseau ? (`false` = coupure certaine) */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/**
 * Erreur « pas de réseau ». Le message contient « NetworkError » à dessein :
 * `humanizeError` (lib/db) le traduit en « Pas de connexion. Vérifie ton réseau. »
 */
export class OfflineError extends Error {
  constructor(message = 'NetworkError: pas de connexion') {
    super(message)
    this.name = 'OfflineError'
  }
}

/** Le coupe-circuit est-il ouvert (on attend avant de retenter) ? */
export function isBackingOff(): boolean {
  return Date.now() < blockedUntil
}

/** Retour du réseau : on oublie les échecs passés pour repartir sans délai. */
export function resetBackoff(): void {
  failures = 0
  blockedUntil = 0
}

function noteFailure(): void {
  failures += 1
  if (failures >= FAILURES_BEFORE_BACKOFF) {
    const step = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (failures - FAILURES_BEFORE_BACKOFF))
    blockedUntil = Date.now() + step
    // Réseau annoncé présent mais injoignable : on le dit quand même à l'utilisateur.
    useConnectivityStore.getState().setOffline()
  }
}

function noteSuccess(): void {
  resetBackoff()
  const now = Date.now()
  const { lastSyncAt, status, markSynced, setOnline } = useConnectivityStore.getState()
  // Une réponse par seconde n'a pas besoin d'être horodatée : on note au plus toutes les 20 s.
  if (!lastSyncAt || now - lastSyncAt > SYNC_MARK_INTERVAL_MS) markSynced(now)
  if (status === 'offline') setOnline()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', resetBackoff)
}

/* ─────────────── Cache de lecture des tables d'affichage ─────────────── */

interface CachedResponse {
  /** Corps JSON brut, tel que renvoyé par PostgREST */
  b: string
  /** En-tête content-range (utilisé pour les counts) */
  cr: string | null
}

function headerValue(input: RequestInfo | URL, init: RequestInit | undefined, name: string): string {
  try {
    const h = init?.headers ?? (input instanceof Request ? input.headers : undefined)
    if (!h) return ''
    return new Headers(h as HeadersInit).get(name) ?? ''
  } catch {
    return ''
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const m = init?.method ?? (input instanceof Request ? input.method : 'GET')
  return m.toUpperCase()
}

/** Clé de cache d'une lecture, ou null si la requête n'est pas rejouable */
function readKey(input: RequestInfo | URL, init?: RequestInit): string | null {
  if (requestMethod(input, init) !== 'GET') return null
  const url = requestUrl(input)
  const table = REST_TABLE.exec(url)?.[1]
  if (!table || !CACHEABLE_TABLES.has(table)) return null
  // L'en-tête Accept change la forme du corps (objet vs tableau) : il fait partie de la clé.
  const accept = headerValue(input, init, 'accept')
  const path = url.slice(url.indexOf('/rest/v1/'))
  return `rest:${accept}:${path}`
}

/** Rejoue une réponse mémorisée, marquée `x-awy-cached-at` pour la traçabilité */
function replayFromCache(key: string): Response | null {
  const hit = readCache<CachedResponse>(key)
  if (!hit || typeof hit.data?.b !== 'string') return null
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'x-awy-cached-at': String(hit.savedAt),
  })
  if (hit.data.cr) headers.set('content-range', hit.data.cr)
  return new Response(hit.data.b, { status: 200, statusText: 'OK', headers })
}

/** Mémorise la réponse sans retarder l'appelant */
function memorize(key: string, res: Response): void {
  res
    .clone()
    .text()
    .then((b) => writeCache(key, { b, cr: res.headers.get('content-range') } satisfies CachedResponse))
    .catch(() => {
      /* une réponse non mémorisée n'est pas un problème */
    })
}

/* ─────────────── fetch encadré ─────────────── */

/** Les envois de fichiers (vlogs) n'ont pas de délai maximum : ils sont longs par nature. */
function needsTimeout(url: string): boolean {
  return !url.includes('/storage/v1/')
}

/**
 * `fetch` utilisé par le client Supabase : hors ligne il ne part pas, en ligne il
 * est borné dans le temps, et une lecture qui échoue retombe sur le cache local.
 */
export async function guardedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const key = readKey(input, init)

  if (!isOnline()) {
    const cached = key ? replayFromCache(key) : null
    if (cached) return cached
    throw new OfflineError()
  }

  if (isBackingOff()) {
    const cached = key ? replayFromCache(key) : null
    if (cached) return cached
    throw new OfflineError('NetworkError: réseau injoignable, nouvelle tentative dans un instant')
  }

  const url = requestUrl(input)
  const external = init?.signal ?? null
  const controller = needsTimeout(url) ? new AbortController() : null
  let timer: ReturnType<typeof setTimeout> | null = null

  if (controller) {
    timer = setTimeout(() => controller.abort(new OfflineError('NetworkError: délai dépassé')), REQUEST_TIMEOUT_MS)
    if (external) {
      if (external.aborted) controller.abort(external.reason)
      else external.addEventListener('abort', () => controller.abort(external.reason), { once: true })
    }
  }

  try {
    const res = await fetch(input, controller ? { ...init, signal: controller.signal } : init)
    noteSuccess()
    if (key && res.ok) memorize(key, res)
    return res
  } catch (err) {
    // Annulation demandée par l'appelant : ce n'est pas un incident réseau.
    if (external?.aborted) throw err
    noteFailure()
    const cached = key ? replayFromCache(key) : null
    if (cached) return cached
    throw err
  } finally {
    if (timer) clearTimeout(timer)
  }
}
