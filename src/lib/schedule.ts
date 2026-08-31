import type { ScheduleSlot } from '@/types/database'

/** Palette des créneaux (6 pastilles) */
export const SLOT_COLORS = ['#D4A574', '#C2788E', '#8FB3A9', '#9B9CC7', '#E0B98A', '#D99AAD'] as const
export const SLOT_COLOR_NAMES: Record<string, string> = {
  '#D4A574': 'Or', '#C2788E': 'Rose', '#8FB3A9': 'Sauge',
  '#9B9CC7': 'Lavande', '#E0B98A': 'Sable', '#D99AAD': 'Pétale',
}

/** Jours de semaine : 1 = lundi … 7 = dimanche */
export const WEEKDAY_SHORT = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'] as const
export const WEEKDAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] as const
export const WEEKDAY_ABBR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const

/** Les sept jours, dans l'ordre français (lundi en tête) */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

/**
 * Libellé d'un jour (1 = lundi … 7 = dimanche).
 * En français les noms de jours s'écrivent en minuscules : la majuscule n'est
 * demandée (`capitalized`) qu'en début de phrase, de titre ou d'étiquette isolée.
 */
export function weekdayLabel(weekday: number, capitalized = false): string {
  const label = WEEKDAY_LABELS[weekday - 1] ?? ''
  return capitalized ? label : label.toLowerCase()
}

/** 'HH:MM' ou 'HH:MM:SS' → minutes depuis minuit */
export function timeToMinutes(t: string): number {
  const [h = '0', m = '0'] = t.split(':')
  return Number(h) * 60 + Number(m)
}

/** minutes depuis minuit → 'HH:MM' */
export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 'HH:MM:SS' → 'HH:MM' */
export function shortTime(t: string): string {
  return t.slice(0, 5)
}

/**
 * Instant « maintenant » vu depuis un fuseau : jour de semaine (1–7), minutes
 * depuis minuit, et date du jour là-bas. La date compte autant que le jour de
 * semaine depuis que les créneaux peuvent être datés : à 23 h à Varsovie il est
 * encore la veille à Paris, et ce n'est pas le même cours.
 */
export function localClockIn(
  tz: string,
  now: Date = new Date(),
): { weekday: number; minutes: number; date: string } {
  const secours = () => ({
    weekday: ((now.getDay() + 6) % 7) + 1,
    minutes: now.getHours() * 60 + now.getMinutes(),
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
  })
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(now)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
    const weekday = map[get('weekday')] ?? ((now.getDay() + 6) % 7) + 1
    const annee = get('year'), mois = get('month'), jour = get('day')
    if (!annee || !mois || !jour) return { ...secours(), weekday }
    return {
      weekday,
      minutes: Number(get('hour')) * 60 + Number(get('minute')),
      date: `${annee}-${mois}-${jour}`,
    }
  } catch {
    return secours()
  }
}

/**
 * Créneaux rangés par jour (1 = lundi … 7 = dimanche), déjà triés par heure de
 * début. Un emploi du temps importé peut compter plusieurs centaines de lignes :
 * refiltrer la liste entière une fois par jour affiché, à chaque rendu — et il y
 * en a un par minute, l’horloge avance — c’est sept parcours au lieu d’un.
 */
export function indexByWeekday(slots: ScheduleSlot[]): Map<number, ScheduleSlot[]> {
  const byDay = new Map<number, ScheduleSlot[]>()
  for (const d of WEEKDAYS) byDay.set(d, [])
  for (const s of slots) byDay.get(s.weekday)?.push(s)
  for (const list of byDay.values()) list.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
  return byDay
}

/**
 * Identifiants réellement supprimables : ceux qui sont cochés ET qui
 * m’appartiennent. La règle d’accès « schedule delete own » refuserait de toute
 * façon un créneau du partenaire (`using (user_id = auth.uid())`) : on ne le lui
 * demande jamais. L’ordre suit celui de la liste, pour qu’un échec en cours de
 * route puisse dire exactement ce qui est parti.
 */
export function deletableIds(
  slots: ScheduleSlot[],
  selected: ReadonlySet<string>,
  userId: string | null | undefined,
): string[] {
  if (!userId) return []
  return slots.filter((s) => s.user_id === userId && selected.has(s.id)).map((s) => s.id)
}

/** « 1 créneau », « 3 créneaux » — l’accord au singulier compte autant que le reste */
export function slotCount(n: number): string {
  return `${n} créneau${n > 1 ? 'x' : ''}`
}

/**
 * Phrase d’un échec partiel de suppression. Dire le chiffre exact plutôt que
 * « une erreur est survenue » : c’est la seule façon de savoir ce qu’il reste à
 * faire. Même motif que `partialFailureMessage` du côté import.
 */
export function partialDeleteMessage(deleted: number, total: number): string {
  const many = deleted > 1
  return `${deleted} créneau${many ? 'x' : ''} sur ${total} ${many ? 'ont' : 'a'} été supprimé${many ? 's' : ''}.`
}

// ─────────────────────────────────────────────────────────────────────────────
// Dates
//
// Un créneau sans `slot_date` revient chaque semaine ; un créneau daté n'a lieu
// que ce jour-là. Les deux cohabitent : le sport du mardi soir reste une
// habitude hebdomadaire même quand l'année de cours, elle, est importée date
// par date.
// ─────────────────────────────────────────────────────────────────────────────

/** 'AAAA-MM-JJ' d'une date locale, sans passer par UTC (qui décale d'un jour le soir). */
export function isoDate(d: Date): string {
  const mois = String(d.getMonth() + 1).padStart(2, '0')
  const jour = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mois}-${jour}`
}

/** 'AAAA-MM-JJ' → Date locale à midi (midi, pour qu'aucun changement d'heure ne fasse basculer le jour). */
export function fromIsoDate(iso: string): Date {
  const [a, m, j] = iso.split('-').map(Number)
  return new Date(a ?? 1970, (m ?? 1) - 1, j ?? 1, 12)
}

/** Lundi de la semaine qui contient cette date. */
export function mondayOf(d: Date): Date {
  const copie = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)
  const decalage = (copie.getDay() + 6) % 7 // 0 = lundi
  copie.setDate(copie.getDate() - decalage)
  return copie
}

/** Décale une date d'un nombre de jours (négatif pour reculer). */
export function addDays(d: Date, days: number): Date {
  const copie = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)
  copie.setDate(copie.getDate() + days)
  return copie
}

/** Date du jour de semaine demandé (1 = lundi) dans la semaine de ce lundi. */
export function dateOfWeekday(monday: Date, weekday: number): string {
  return isoDate(addDays(monday, weekday - 1))
}

/**
 * Étiquette d'une semaine : « 1 – 7 septembre », « 29 sept. – 5 oct. »,
 * « 28 déc. 2026 – 3 janv. 2027 ». Le mois n'est répété que s'il change, et
 * l'année que si elle change : c'est ce qu'on écrirait à la main.
 */
export function weekLabel(monday: Date): string {
  const dimanche = addDays(monday, 6)
  const mois = (d: Date) => d.toLocaleDateString('fr-FR', { month: 'short' }).replace(/\.$/, '')
  const memeAnnee = monday.getFullYear() === dimanche.getFullYear()
  const memeMois = memeAnnee && monday.getMonth() === dimanche.getMonth()
  const annee = (d: Date) => (memeAnnee ? '' : ` ${d.getFullYear()}`)
  if (memeMois) return `${monday.getDate()} – ${dimanche.getDate()} ${mois(dimanche)}`
  return `${monday.getDate()} ${mois(monday)}${annee(monday)} – ${dimanche.getDate()} ${mois(dimanche)}${annee(dimanche)}`
}

/** Cette semaine contient-elle aujourd'hui ? */
export function isCurrentWeek(monday: Date, now: Date = new Date()): boolean {
  return isoDate(mondayOf(now)) === isoDate(monday)
}

/**
 * Les créneaux qui s'appliquent à une semaine donnée : les hebdomadaires
 * (toujours) et les datés dont la date tombe dans cette semaine. Filtrer une
 * fois ici évite de refaire le test sur chaque jour, sept fois, à chaque rendu —
 * et il y en a un par minute, l'horloge avance.
 */
export function slotsForWeek(slots: ScheduleSlot[], monday: Date): ScheduleSlot[] {
  const debut = isoDate(monday)
  const fin = isoDate(addDays(monday, 6))
  return slots.filter((s) => !s.slot_date || (s.slot_date >= debut && s.slot_date <= fin))
}

/** « le mardi 8 septembre » / « chaque mardi » — pour les phrases de confirmation. */
export function slotWhen(slot: Pick<ScheduleSlot, 'weekday' | 'slot_date'>): string {
  if (!slot.slot_date) return `chaque ${weekdayLabel(slot.weekday)}`
  const d = fromIsoDate(slot.slot_date)
  return `le ${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`
}

export interface CurrentSlotResult {
  /** Créneau en cours (ou null) */
  current: ScheduleSlot | null
  /** Prochain créneau du même jour (ou null) */
  next: ScheduleSlot | null
  weekday: number
  minutes: number
}

/**
 * Fonction pure : pour une liste de créneaux hebdomadaires et un fuseau,
 * renvoie le créneau en cours et le prochain créneau du jour, vus depuis ce fuseau.
 */
export function getCurrentSlot(slots: ScheduleSlot[], tz: string, now: Date = new Date()): CurrentSlotResult {
  const { weekday, minutes, date } = localClockIn(tz, now)
  // Un créneau daté n'existe que le jour de sa date ; un créneau hebdomadaire
  // revient chaque semaine. Sans cette distinction, le cours du 8 septembre
  // réapparaissait tous les mardis de l'année.
  const today = slots
    .filter((s) => (s.slot_date ? s.slot_date === date : s.weekday === weekday))
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
  const current = today.find((s) => timeToMinutes(s.start_time) <= minutes && minutes < timeToMinutes(s.end_time)) ?? null
  const next = today.find((s) => timeToMinutes(s.start_time) > minutes) ?? null
  return { current, next, weekday, minutes }
}

export type SlotIconKind = 'book' | 'work' | 'sport' | 'meal' | 'night' | 'clock'

/** Icône déduite du titre d'un créneau */
export function slotIconKind(title: string): SlotIconKind {
  const t = title.toLowerCase()
  if (/\b(cours|maths?|école|ecole|fac|lycée|lycee|td|tp|examen|partiel|révision|revision)\b/.test(t)) return 'book'
  if (/\b(travail|boulot|stage|bureau|taf|job|réunion|reunion)\b/.test(t)) return 'work'
  if (/\b(sport|gym|muscu|foot|course|running|yoga|danse|natation|vélo|velo)\b/.test(t)) return 'sport'
  if (/\b(repas|déj|dej|déjeuner|dejeuner|dîner|diner|petit-déj|brunch|cantine)\b/.test(t)) return 'meal'
  if (/\b(nuit|dodo|sommeil|coucher)\b/.test(t)) return 'night'
  return 'clock'
}

/** Phrase « Clarisse est en cours de maths » / « Clarisse : Sport » */
export function currentSlotPhrase(name: string, title: string): string {
  const trimmed = title.trim()
  if (/^cours\b/i.test(trimmed)) return `${name} est en ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`
  return `${name} : ${trimmed}`
}

/**
 * Couleur stable déduite d'un intitulé : « Maths » aura toujours la même
 * pastille. Utilisé par l'import, pour qu'un emploi du temps arrivé d'un fichier
 * ressemble à un emploi du temps saisi à la main, et non à un mur monochrome.
 */
export function colorForTitle(title: string): string {
  let hash = 0
  for (const ch of title.trim().toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return SLOT_COLORS[hash % SLOT_COLORS.length]
}
