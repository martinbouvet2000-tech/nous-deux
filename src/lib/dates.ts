import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

/**
 * Formatage français — source unique de vérité pour les dates et heures affichées.
 *
 * Règles typographiques appliquées ici, une fois pour toutes :
 *  - date numérique en `jj/mm/aaaa` (jamais `mm/jj/aaaa`) ;
 *  - heure sur 24 h (« 14:30 », « 00:00 »), jamais « 2:30 PM » ;
 *  - jours et mois en toutes lettres et en minuscules (« mardi 3 mars 2026 »),
 *    la majuscule étant réservée aux débuts de phrase (`capitalizeFirst`) ;
 *  - « 1er » pour le premier jour du mois, chiffre nu ensuite.
 *
 * Ces fonctions lisent les composantes CIVILES d'une `Date` (jour/heure tels que
 * portés par l'objet). Pour afficher un INSTANT stocké (ex. `start_at` en UTC)
 * dans le fuseau d'un profil, passer d'abord par `@/lib/timezone`
 * (`formatTimeIn`, `zonedCivilDate`, `formatDayTimeIn`…) : ce module ne connaît
 * pas les fuseaux et n'en invente jamais.
 */

/** Valeur d'un `<input type="date">` ou `<input type="datetime-local">` (heure optionnelle) */
const DATE_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2})?)?$/
/** Valeur d'un `<input type="time">` (secondes optionnelles) */
const TIME_INPUT_RE = /^(\d{2}):(\d{2})(?::\d{2})?$/

/** Majuscule sur la première lettre seulement — « mardi 3 mars » → « Mardi 3 mars » */
export function capitalizeFirst(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

/** Quantième à la française : « 1er » le premier du mois, « 2 », « 3 »… ensuite */
function dayOfMonthFR(date: Date): string {
  const day = date.getDate()
  return day === 1 ? '1er' : String(day)
}

/** Date numérique française : « 03/03/2026 » */
export function formatDateFR(date: Date): string {
  return format(date, 'dd/MM/yyyy')
}

/** Heure sur 24 h : « 14:30 », « 00:00 » */
export function formatTimeFR(date: Date): string {
  return format(date, 'HH:mm')
}

/** Jour de semaine + quantième + mois : « mardi 3 mars » */
export function formatDayMonthFR(date: Date): string {
  return `${format(date, 'EEEE', { locale: fr })} ${dayOfMonthFR(date)} ${format(date, 'MMMM', { locale: fr })}`
}

/**
 * Quantième + mois, sans le jour de la semaine : « 3 mars », « 1er mars ».
 * Pour les surfaces étroites (pied d'une carte de vlog, pastille de l'accueil)
 * où « vendredi 28 août » ne tient pas et se ferait tronquer.
 */
export function formatDayMonthShortFR(date: Date): string {
  return `${dayOfMonthFR(date)} ${format(date, 'MMMM', { locale: fr })}`
}

/** Date en toutes lettres : « mardi 3 mars 2026 » */
export function formatLongDateFR(date: Date): string {
  return `${formatDayMonthFR(date)} ${format(date, 'yyyy')}`
}

/** Mois + année : « mars 2026 » */
export function formatMonthYearFR(date: Date): string {
  return format(date, 'MMMM yyyy', { locale: fr })
}

/** Date en toutes lettres + heure : « mardi 3 mars 2026 à 14:30 » */
export function formatLongDateTimeFR(date: Date): string {
  return `${formatLongDateFR(date)} à ${formatTimeFR(date)}`
}

/** Valeur d'un `<input type="date">` : « 2026-03-03 » (heure civile, jamais `toISOString`) */
export function toDateInputValue(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** Valeur d'un `<input type="datetime-local">` : « 2026-03-03T14:30 » */
export function toDateTimeInputValue(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm")
}

/**
 * Lit la valeur d'un champ date / datetime-local comme une date civile.
 * Indépendant du fuseau : on relit exactement les composantes saisies.
 * Renvoie `null` si la valeur est vide, mal formée ou impossible (31/02).
 */
export function parseDateInputValue(value: string): Date | null {
  const m = DATE_INPUT_RE.exec(value.trim())
  if (!m) return null
  const [year, month, day, hour, minute] = [m[1], m[2], m[3], m[4] ?? '00', m[5] ?? '00'].map(Number)
  if (hour > 23 || minute > 59) return null
  const date = new Date(year, month - 1, day, hour, minute, 0, 0)
  // Le constructeur « reporte » les dates impossibles (31 février → 3 mars) : on les refuse.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

/** Écho français d'un `<input type="date">` : « mardi 3 mars 2026 » (chaîne vide si invalide) */
export function describeDateInput(value: string): string {
  const date = parseDateInputValue(value)
  return date ? formatLongDateFR(date) : ''
}

/** Écho français d'un `<input type="datetime-local">` : « mardi 3 mars 2026 à 14:30 » */
export function describeDateTimeInput(value: string): string {
  const date = parseDateInputValue(value)
  return date ? formatLongDateTimeFR(date) : ''
}

/** Écho français d'un `<input type="time">` : « 14:30 » sur 24 h (chaîne vide si invalide) */
export function describeTimeInput(value: string): string {
  const m = TIME_INPUT_RE.exec(value.trim())
  if (!m) return ''
  const [hour, minute] = [Number(m[1]), Number(m[2])]
  if (hour > 23 || minute > 59) return ''
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** Écho français d'un couple d'`<input type="time">` : « de 09:00 à 10:00 » */
export function describeTimeRangeInput(start: string, end: string): string {
  const from = describeTimeInput(start)
  if (!from) return ''
  const to = describeTimeInput(end)
  return to ? `de ${from} à ${to}` : `à partir de ${from}`
}

/**
 * Écho français d'un couple d'`<input type="datetime-local">` :
 *  - même jour   → « mardi 3 mars 2026, de 18:00 à 19:00 »
 *  - à cheval    → « du mardi 3 mars 2026 à 23:30 au mercredi 4 mars 2026 à 01:00 »
 */
export function describeDateTimeRangeInput(start: string, end: string): string {
  const from = parseDateInputValue(start)
  if (!from) return ''
  const to = parseDateInputValue(end)
  if (!to) return formatLongDateTimeFR(from)
  if (toDateInputValue(from) === toDateInputValue(to)) {
    return `${formatLongDateFR(from)}, de ${formatTimeFR(from)} à ${formatTimeFR(to)}`
  }
  return `du ${formatLongDateTimeFR(from)} au ${formatLongDateTimeFR(to)}`
}
