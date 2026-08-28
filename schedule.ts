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

/** Instant « maintenant » vu depuis un fuseau : jour de semaine (1–7) et minutes depuis minuit */
export function localClockIn(tz: string, now: Date = new Date()): { weekday: number; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit',
    }).formatToParts(now)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
    const weekday = map[get('weekday')] ?? ((now.getDay() + 6) % 7) + 1
    return { weekday, minutes: Number(get('hour')) * 60 + Number(get('minute')) }
  } catch {
    return { weekday: ((now.getDay() + 6) % 7) + 1, minutes: now.getHours() * 60 + now.getMinutes() }
  }
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
  const { weekday, minutes } = localClockIn(tz, now)
  const today = slots
    .filter((s) => s.weekday === weekday)
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
