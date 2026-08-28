import { detectTimezone, isValidTimezone, zonedDateKey, zonedInputToDate } from '@/lib/timezone'

/**
 * ═══ « Aujourd'hui », une seule définition pour tout le tableau de bord ═══
 *
 * Règle unique : **le jour, c'est la journée civile dans le fuseau du PROFIL**
 * (`profile.timezone`, avec repli sur le fuseau détecté). Jamais le fuseau du
 * navigateur, jamais UTC. C'est exactement la règle de l'agenda (`CalendarPage`).
 *
 * Pourquoi : Martin est à Varsovie, Clarisse à Paris. Entre minuit et 2 h du
 * matin, « le jour du navigateur », « le jour UTC » et « le jour sur place »
 * divergeaient — les compteurs et la série repartaient à zéro trop tôt (ou trop
 * tard), et un simple voyage suffisait à tout décaler.
 *
 * ⚠ Une seule exception, assumée : la fenêtre ANTI-SPAM. Le trigger
 * `limit_taps_per_day()` (migration `20260818120000_security_hardening.sql`)
 * compte `created_at >= date_trunc('day', now())`, évalué avec la session
 * Postgres en UTC : **la base tranche la journée en UTC**. Le client s'aligne
 * sur la base (`startOfServerDay`) plutôt que l'inverse — sinon on annoncerait
 * « il t'en reste » alors que le serveur refuse déjà, ou le contraire. Voir
 * `startOfServerDay` plus bas.
 */

/** Profondeur d'analyse d'une série, en jours. Au-delà, on ne remonte pas. */
export const STREAK_LOOKBACK_DAYS = 60

/** Plafond quotidien d'envois imposé par la base (trigger `limit_taps_per_day`). */
export const DAILY_SIGNAL_LIMIT = 30

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Fuseau de référence : celui du profil s'il est exploitable, sinon celui du
 * navigateur. Toute la logique « jour » de l'app passe par ici.
 */
export function resolveTimezone(tz?: string | null): string {
  return tz && isValidTimezone(tz) ? tz : detectTimezone()
}

/** Clé civile « yyyy-MM-dd » d'un instant, vu depuis `tz`. */
export function dayKey(tz: string, at: Date = new Date()): string {
  return zonedDateKey(tz, at)
}

/**
 * Décale une clé de jour de `days` jours. Arithmétique purement calendaire
 * (via `Date.UTC`) : insensible au DST, contrairement à un `setDate()` local
 * qui peut sauter ou répéter un jour lors d'une bascule d'heure.
 */
export function shiftDayKey(key: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return key
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() + days)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/**
 * Instant exact du minuit civil (début de journée) dans `tz`.
 * Sert de borne basse aux requêtes « depuis ce matin ».
 */
export function startOfDayIn(tz: string, at: Date = new Date()): Date {
  const key = dayKey(tz, at)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return new Date(NaN)
  return zonedInputToDate(tz, `${key}T00:00`)
}

/** Même chose, prête à partir dans un filtre PostgREST (`.gte('created_at', …)`). */
export function startOfDayISO(tz: string, at: Date = new Date()): string {
  return startOfDayIn(tz, at).toISOString()
}

/**
 * Échéance d'un compte à rebours, lue dans le fuseau du PROFIL.
 *
 * La colonne `countdowns.target_date` peut contenir trois formes :
 *  - un instant complet (« 2027-03-01T22:59:00+00:00 »), ce qu'écrit l'accueil
 *    aujourd'hui — on le prend tel quel, il porte déjà son fuseau ;
 *  - une heure murale sans fuseau (« 2027-03-01T23:59 ») ;
 *  - une date nue (« 2027-03-01 »), forme historique.
 *
 * Les deux dernières n'ont de sens que rapportées à un fuseau : `new Date()` les
 * lirait en UTC (date nue) ou en heure navigateur, et un simple voyage décalait
 * l'échéance d'un jour. On les interprète donc dans `tz`, la date nue valant
 * **fin de journée sur place** — exactement ce que `Dashboard` enregistre à la
 * création, pour que « J-0 » tienne toute la journée là où tu es.
 */
export function countdownTargetIn(tz: string, value: string): Date {
  const wall = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::\d{2})?)?$/.exec(value.trim())
  if (wall) return zonedInputToDate(tz, `${wall[1]}T${wall[2] ?? '23:59'}`)
  return new Date(value)
}

/**
 * Début de la journée **telle que la base la découpe** : minuit UTC, comme
 * `date_trunc('day', now())` côté Postgres (session en UTC). À n'utiliser QUE
 * pour raisonner sur le quota anti-spam, afin que client et base racontent la
 * même histoire. Pour tout le reste, c'est `startOfDayIn(profileTz)`.
 */
export function startOfServerDay(at: Date = new Date()): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
}

/** Même chose en ISO, pour un filtre PostgREST aligné sur le trigger serveur. */
export function startOfServerDayISO(at: Date = new Date()): string {
  return startOfServerDay(at).toISOString()
}

/** Ensemble des jours civils (dans `tz`) touchés par une liste d'instants. */
export function dayKeySet(tz: string, instants: readonly (string | Date)[]): Set<string> {
  const keys = new Set<string>()
  for (const instant of instants) {
    const d = instant instanceof Date ? instant : new Date(instant)
    if (Number.isNaN(d.getTime())) continue
    keys.add(dayKey(tz, d))
  }
  return keys
}

/**
 * Longueur d'une série (jours consécutifs) en remontant depuis aujourd'hui.
 * `hasDay(clé)` dit si la journée compte.
 *
 * La journée EN COURS ne casse jamais la série : tant qu'elle n'est pas jouée,
 * on repart de la veille. Un trou d'un jour, en revanche, remet à zéro.
 */
export function streakFrom(
  tz: string,
  hasDay: (key: string) => boolean,
  now: Date = new Date(),
  maxDays: number = STREAK_LOOKBACK_DAYS,
): number {
  const today = dayKey(tz, now)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return 0
  let streak = 0
  for (let i = 0; i < maxDays; i++) {
    const key = shiftDayKey(today, -i)
    if (hasDay(key)) {
      streak++
      continue
    }
    if (i === 0) continue // aujourd'hui pas encore fait → on ne casse pas la série
    break
  }
  return streak
}

/**
 * Série « à deux » : nombre de jours consécutifs où chacun s'est manifesté.
 * Les deux listes d'instants sont regroupées dans LE MÊME fuseau (celui du
 * profil), ce qui rend la série stable si l'un des deux voyage : on ne mélange
 * plus « les événements en heure navigateur » avec « aujourd'hui en UTC ».
 */
export function mutualStreak(
  tz: string,
  mine: readonly (string | Date)[],
  theirs: readonly (string | Date)[],
  now: Date = new Date(),
  maxDays: number = STREAK_LOOKBACK_DAYS,
): number {
  const mineKeys = dayKeySet(tz, mine)
  const theirKeys = dayKeySet(tz, theirs)
  return streakFrom(tz, (key) => mineKeys.has(key) && theirKeys.has(key), now, maxDays)
}

/** Nombre d'instants tombant aujourd'hui, au sens de la base (journée UTC). */
export function countSinceServerDay(instants: readonly (string | Date)[], now: Date = new Date()): number {
  const floor = startOfServerDay(now).getTime()
  let n = 0
  for (const instant of instants) {
    const d = instant instanceof Date ? instant : new Date(instant)
    if (!Number.isNaN(d.getTime()) && d.getTime() >= floor) n++
  }
  return n
}
