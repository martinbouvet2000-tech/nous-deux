/**
 * Cache local « dernières données connues » : mémoire + localStorage.
 *
 * Objectif : hors ligne, l'écran ne doit jamais être vide. On garde une copie
 * des dernières données lues (profil, profil du partenaire, humeur, dispo) pour
 * pouvoir les réafficher instantanément au démarrage, même sans réseau.
 *
 * Règles :
 *  - tout est encapsulé dans des try/catch (localStorage peut lever en navigation
 *    privée, ou quand le quota est plein) : un cache qui casse ne casse jamais l'app ;
 *  - une entrée trop vieille (> 7 jours) ou trop grosse est ignorée ;
 *  - le cache est purgé à la déconnexion (données intimes).
 */

const PREFIX = 'awy:cache:v1:'
/** Au-delà, l'entrée est trop vieille pour être réaffichée */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
/** Une entrée trop grosse n'a rien à faire dans localStorage (quota ~5 Mo) */
const MAX_ENTRY_CHARS = 64 * 1024
/** Nombre d'entrées conservées au maximum (les plus anciennes sautent) */
const MAX_ENTRIES = 48

/** Clés stables des données que l'on veut retrouver hors ligne */
export const CACHE_KEYS = {
  user: 'auth:user',
  profile: 'auth:profile',
  partnerProfile: 'auth:partner-profile',
  lastSync: 'sync:last',
} as const

export interface Cached<T> {
  data: T
  /** Horodatage (ms) de la mise en cache */
  savedAt: number
}

interface Stored {
  t: number
  d: unknown
}

/** Miroir mémoire : évite de reparser du JSON à chaque lecture (rendu, effets…) */
const memory = new Map<string, Stored>()

function store(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function isFresh(entry: Stored): boolean {
  return typeof entry.t === 'number' && Date.now() - entry.t < MAX_AGE_MS
}

/** Dernière valeur connue pour cette clé, ou null si absente / périmée */
export function readCache<T>(key: string): Cached<T> | null {
  const hit = memory.get(key)
  if (hit) {
    if (isFresh(hit)) return { data: hit.d as T, savedAt: hit.t }
    removeCache(key)
    return null
  }
  const s = store()
  if (!s) return null
  try {
    const raw = s.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Stored
    if (!parsed || typeof parsed.t !== 'number') return null
    if (!isFresh(parsed)) {
      removeCache(key)
      return null
    }
    memory.set(key, parsed)
    return { data: parsed.d as T, savedAt: parsed.t }
  } catch {
    return null
  }
}

/** Mémorise la donnée (et son horodatage). Silencieux en cas d'échec. */
export function writeCache(key: string, data: unknown): void {
  const entry: Stored = { t: Date.now(), d: data }
  memory.set(key, entry)
  const s = store()
  if (!s) return
  try {
    const raw = JSON.stringify(entry)
    if (raw.length > MAX_ENTRY_CHARS) return
    s.setItem(PREFIX + key, raw)
    prune(s)
  } catch {
    // Quota dépassé / mode privé : on repart proprement, la mémoire suffit
    try {
      clearCache()
      memory.set(key, entry)
    } catch {
      /* rien à faire de plus */
    }
  }
}

export function removeCache(key: string): void {
  memory.delete(key)
  try {
    store()?.removeItem(PREFIX + key)
  } catch {
    /* ignoré */
  }
}

/** Purge tout le cache local (déconnexion, suppression de compte, quota plein) */
export function clearCache(): void {
  memory.clear()
  const s = store()
  if (!s) return
  try {
    for (const key of ourKeys(s)) s.removeItem(key)
  } catch {
    /* ignoré */
  }
}

function ourKeys(s: Storage): string[] {
  const keys: string[] = []
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i)
    if (k && k.startsWith(PREFIX)) keys.push(k)
  }
  return keys
}

/** Horodatage d'une entrée stockée, 0 si illisible */
function entryTime(s: Storage, key: string): number {
  try {
    return (JSON.parse(s.getItem(key) ?? '{}') as Stored).t ?? 0
  } catch {
    return 0
  }
}

/** Garde les MAX_ENTRIES entrées les plus récentes */
function prune(s: Storage): void {
  const keys = ourKeys(s)
  if (keys.length <= MAX_ENTRIES) return
  const dated = keys.map((k) => ({ k, t: entryTime(s, k) }))
  dated.sort((a, b) => a.t - b.t)
  for (const { k } of dated.slice(0, dated.length - MAX_ENTRIES)) {
    s.removeItem(k)
    memory.delete(k.slice(PREFIX.length))
  }
}

/**
 * Âge d'une donnée en français, ton parlé : « à l'instant », « il y a 5 min »,
 * « il y a 2 h », « hier », « il y a 3 jours ».
 */
export function formatAge(savedAt: number, now = Date.now()): string {
  const ms = Math.max(0, now - savedAt)
  const min = Math.floor(ms / 60_000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'hier'
  return `il y a ${d} jours`
}
