/**
 * ═══ Cœur de l'import d'emploi du temps ═══
 *
 * Fonctions PURES : un tableau de cellules (venu d'un CSV, d'un classeur Excel
 * ou d'un PDF) entre, des créneaux candidats sortent. Aucun accès réseau, aucun
 * accès au DOM, aucune écriture en base — tout ce qui est ici est testable seul.
 *
 * Deux dispositions sont reconnues, parce que ce sont les deux qui existent
 * vraiment dans la nature :
 *  - « lignes »  : une ligne par créneau (colonnes jour / début / fin / intitulé) ;
 *  - « grille »  : les jours en colonnes, les heures en lignes — la forme
 *    habituelle d'un emploi du temps scolaire (et sa version transposée).
 *
 * Le parti pris est de ne JAMAIS deviner en silence : tout ce qui n'a pas été
 * compris ressort en `issues`, et l'écran de relecture le montre.
 */

import { minutesToTime, timeToMinutes } from '@/lib/schedule'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Disposition reconnue dans le fichier */
export type Layout = 'rows' | 'grid' | 'lines' | 'none'

/** Ce qui cloche sur une ligne — affiché tel quel dans l'écran de relecture */
export type IssueCode =
  | 'weekday-missing'
  | 'start-missing'
  | 'end-missing'
  | 'end-before-start'
  | 'title-missing'
  | 'title-truncated'
  | 'duration-long'
  | 'overlap'
  | 'duplicate'
  | 'uncertain'

export const ISSUE_LABEL: Record<IssueCode, string> = {
  'weekday-missing': 'Jour non reconnu',
  'start-missing': 'Heure de début illisible',
  'end-missing': 'Heure de fin illisible',
  'end-before-start': 'La fin arrive avant le début',
  'title-missing': 'Intitulé vide',
  'title-truncated': 'Intitulé raccourci à 60 caractères',
  'duration-long': 'Durée inhabituelle (plus de 8 h)',
  'overlap': 'Chevauche un autre créneau coché',
  'duplicate': 'Déjà dans ton emploi du temps',
  'uncertain': 'Lecture incertaine, à vérifier',
}

/** Ces défauts empêchent l'enregistrement tant qu'ils ne sont pas corrigés */
const BLOCKING: ReadonlySet<IssueCode> = new Set<IssueCode>([
  'weekday-missing', 'start-missing', 'end-missing', 'end-before-start', 'title-missing',
])

/** Longueurs imposées par la table `schedule_slots` */
export const TITLE_MAX = 60
export const LOCATION_MAX = 60

/** Créneau candidat, éditable dans l'écran de relecture */
export interface SlotDraft {
  /** Clé stable côté React (jamais envoyée en base) */
  key: string
  /** 1 = lundi … 7 = dimanche, `null` si le jour n'a pas été compris */
  weekday: number | null
  /** 'HH:MM', chaîne vide si l'heure n'a pas été comprise */
  start: string
  end: string
  title: string
  location: string | null
  /** Nombre de fois où ce créneau apparaît dans le fichier (une année → une semaine type) */
  occurrences: number
  /** Le parseur n'était pas sûr de lui sur cette ligne */
  uncertain: boolean
  selected: boolean
}

/** Créneau déjà présent en base, pour repérer les doublons */
export interface ExistingSlot {
  weekday: number
  /** 'HH:MM' ou 'HH:MM:SS' */
  start_time: string
  end_time: string
  title: string
}

export interface ReviewedSlot {
  draft: SlotDraft
  issues: IssueCode[]
  /** Impossible à enregistrer en l'état */
  blocking: boolean
}

/** Créneau brut sorti d'une disposition, avant dédoublonnage et contrôle */
export interface RawSlot {
  weekday: number | null
  start: string | null
  end: string | null
  title: string
  location?: string | null
  uncertain?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Texte
// ─────────────────────────────────────────────────────────────────────────────

/** Minuscules, sans accents, espaces normalisés — pour comparer des libellés */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u00a0\u202f\u2009\u200b]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Nettoyage d'un intitulé destiné à la base : espaces recollés, sauts de ligne aplatis */
export function cleanTitle(text: string): string {
  return text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// Jours de la semaine
// ─────────────────────────────────────────────────────────────────────────────

const DAY_WORDS: Record<string, number> = {
  lundi: 1, lun: 1, lu: 1, monday: 1, mon: 1,
  mardi: 2, mar: 2, ma: 2, tuesday: 2, tue: 2, tues: 2,
  mercredi: 3, mer: 3, me: 3, wednesday: 3, wed: 3,
  jeudi: 4, jeu: 4, je: 4, thursday: 4, thu: 4, thurs: 4,
  vendredi: 5, ven: 5, ve: 5, friday: 5, fri: 5,
  samedi: 6, sam: 6, sa: 6, saturday: 6, sat: 6,
  dimanche: 7, dim: 7, di: 7, sunday: 7, sun: 7,
}

/** Initiales sans ambiguïté. « M » est volontairement absent : mardi ou mercredi ? */
const DAY_LETTERS: Record<string, number> = { l: 1, j: 4, v: 5, s: 6, d: 7 }

/**
 * Jour d'une cellule entière : « Lundi », « LUN. », « lu », « Lundi 12/09 ».
 * On refuse une abréviation de deux lettres suivie d'autre chose (« ma journée »
 * n'est pas un mardi) : c'est le seul garde-fou qui évite les faux positifs.
 */
export function parseWeekdayCell(raw: string): number | null {
  const n = normalize(raw)
  if (!n) return null
  const words = n.split(/[^a-z]+/).filter(Boolean)
  const first = words[0]
  if (!first) return null
  const day = DAY_WORDS[first]
  if (day === undefined) return null
  const alone = n.replace(/[^a-z]+/g, '') === first
  if (first.length < 3 && !alone) return null
  return day
}

/** Jour trouvé n'importe où dans un texte (« TD Maths — mardi 8h ») */
export function findWeekday(raw: string): number | null {
  const n = normalize(raw)
  for (const word of n.split(/[^a-z]+/)) {
    if (word.length < 3) continue
    const day = DAY_WORDS[word]
    if (day !== undefined) return day
  }
  return null
}

/**
 * Ligne d'en-tête d'une grille → { index de colonne : jour }.
 * Les initiales seules (« L M M J V S D ») sont acceptées : le « M » ambigu se
 * déduit de son voisin de gauche, exactement comme on le lit à l'œil.
 */
export function weekdayHeader(row: string[]): Map<number, number> {
  const found = new Map<number, number>()
  let last = 0
  for (let i = 0; i < row.length; i++) {
    const cell = row[i] ?? ''
    const n = normalize(cell).replace(/[^a-z]/g, '')
    if (!n) continue
    const day = parseWeekdayCell(cell)
    if (day !== null) { found.set(i, day); last = day; continue }
    if (n.length === 1) {
      const letter = DAY_LETTERS[n]
      if (letter !== undefined) { found.set(i, letter); last = letter; continue }
      // « M » : mardi s'il suit lundi, mercredi s'il suit mardi.
      if (n === 'm' && (last === 1 || last === 2)) { const d = last + 1; found.set(i, d); last = d }
    }
  }
  return found
}

// ─────────────────────────────────────────────────────────────────────────────
// Heures
// ─────────────────────────────────────────────────────────────────────────────

const TIME_RE = /^(\d{1,2})\s*(?:h|:|\.)\s*(\d{1,2})?(?:\s*[:.]\s*\d{1,2})?\s*(am|pm)?$/
const HOUR_ONLY_RE = /^(\d{1,2})\s*(am|pm)$/
const BARE_RE = /^(\d{1,2})$/
/** Fraction de journée telle qu'Excel stocke une heure : 0,354166… = 08:30 */
const EXCEL_FRACTION_RE = /^0[.,](\d+)$/
/** Numéro de série Excel avec partie horaire : 45912,354166… */
const EXCEL_SERIAL_TIME_RE = /^(\d{4,6})[.,](\d+)$/

function assemble(hour: number, minute: number, meridiem: string | undefined): string | null {
  let h = hour
  if (meridiem === 'am') h = h === 12 ? 0 : h
  if (meridiem === 'pm') h = h === 12 ? 12 : h + 12
  if (minute > 59 || h > 24 || (h === 24 && minute > 0) || h < 0) return null
  return minutesToTime(h * 60 + minute)
}

/**
 * Heure d'une cellule → 'HH:MM'. Formats admis : `8h30`, `08:30`, `8:30 AM`,
 * `8.30`, `8h`, `8 h 30`, `08:30:00`, plus les nombres qu'Excel écrit à la
 * place des heures. `allowBare` n'est activé que dans une plage (« 8h30-10 »).
 */
export function parseTime(raw: string, allowBare = false): string | null {
  const n = normalize(raw).replace(/\s*(?:heures?|hrs?)\s*$/, 'h')
  if (!n) return null

  const fraction = EXCEL_FRACTION_RE.exec(n)
  if (fraction) return minutesToTime(Math.round(Number(`0.${fraction[1]}`) * 1440) % 1440)

  const serial = EXCEL_SERIAL_TIME_RE.exec(n)
  if (serial) return minutesToTime(Math.round(Number(`0.${serial[2]}`) * 1440) % 1440)

  const m = TIME_RE.exec(n)
  if (m) return assemble(Number(m[1]), Number(m[2] ?? 0), m[3])

  const only = HOUR_ONLY_RE.exec(n)
  if (only) return assemble(Number(only[1]), 0, only[2])

  if (allowBare) {
    const bare = BARE_RE.exec(n)
    if (bare) return assemble(Number(bare[1]), 0, undefined)
  }
  return null
}

/** Une cellule contient-elle une heure seule ? (sert à deviner le rôle d'une colonne) */
export function looksLikeTime(raw: string): boolean {
  return parseTime(raw) !== null
}

/**
 * Plage horaire dans une seule cellule : « 8h30-10h00 », « 08:30 – 10:00 »,
 * « de 8h30 à 10h », « 8h30 / 10h », « 8h30 au 10h ».
 */
export function parseTimeRange(raw: string): { start: string; end: string } | null {
  let n = normalize(raw)
  if (!n) return null
  n = n.replace(/^(?:de|from|entre)\s+/, '').replace(/\s+(?:a|au|à|to|jusqu'a|jusqu a)\s+/g, '-')
  const parts = n.split(/\s*[-–—>/]+\s*/).filter(Boolean)
  if (parts.length !== 2) return null
  const start = parseTime(parts[0] ?? '', true)
  const end = parseTime(parts[1] ?? '', true)
  if (!start || !end) return null
  return { start, end }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dates (une année d'emploi du temps arrive souvent datée)
// ─────────────────────────────────────────────────────────────────────────────

const DMY_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/
const YMD_RE = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/
/** Numéro de série Excel : jours depuis le 30/12/1899 */
const SERIAL_RE = /^(\d{4,6})(?:[.,]\d+)?$/

/** Date d'une cellule → jour de semaine (1 = lundi … 7 = dimanche) */
export function weekdayFromDate(raw: string): number | null {
  const n = normalize(raw).replace(/\s/g, '')
  if (!n) return null
  const toWeekday = (d: Date) => (Number.isNaN(d.getTime()) ? null : ((d.getDay() + 6) % 7) + 1)

  const ymd = YMD_RE.exec(n)
  if (ymd) return toWeekday(new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])))

  const dmy = DMY_RE.exec(n)
  if (dmy) {
    const year = Number(dmy[3])
    return toWeekday(new Date(year < 100 ? 2000 + year : year, Number(dmy[2]) - 1, Number(dmy[1])))
  }

  const serial = SERIAL_RE.exec(n)
  if (serial) {
    const days = Number(serial[1])
    // 20000 ≈ 1954, 60000 ≈ 2064 : hors de cette fenêtre, ce n'est pas une date.
    if (days < 20000 || days > 60000) return null
    return toWeekday(new Date(Date.UTC(1899, 11, 30 + days)))
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Disposition « lignes » : une ligne = un créneau
// ─────────────────────────────────────────────────────────────────────────────

type Role = 'weekday' | 'date' | 'start' | 'end' | 'range' | 'title' | 'location' | 'ignore'

const HEADER_WORDS: { role: Role; words: string[] }[] = [
  { role: 'weekday', words: ['jour', 'jours', 'jour de la semaine', 'day', 'weekday'] },
  { role: 'date', words: ['date', 'dates', 'jour et date'] },
  { role: 'start', words: ['debut', 'heure de debut', 'heure debut', 'h debut', 'start', 'start time', 'de', 'from', 'commence'] },
  { role: 'end', words: ['fin', 'heure de fin', 'heure fin', 'h fin', 'end', 'end time', 'a', 'to', 'termine'] },
  { role: 'range', words: ['horaire', 'horaires', 'heure', 'heures', 'creneau', 'creneaux', 'plage', 'plage horaire', 'time', 'hour'] },
  { role: 'title', words: ['intitule', 'titre', 'matiere', 'cours', 'libelle', 'label', 'activite', 'title', 'subject', 'enseignement', 'module', 'nom', 'description'] },
  { role: 'location', words: ['lieu', 'salle', 'salles', 'room', 'batiment', 'endroit', 'localisation', 'place', 'site'] },
]

function roleOfHeader(cell: string): Role | null {
  const n = normalize(cell)
  if (!n) return null
  for (const { role, words } of HEADER_WORDS) if (words.includes(n)) return role
  for (const { role, words } of HEADER_WORDS) {
    for (const w of words) if (w.length > 3 && n.includes(w)) return role
  }
  return null
}

interface RowPlan {
  headerIndex: number
  roles: Map<number, Role>
}

/** Repère une ligne d'en-tête exploitable dans les premières lignes du fichier */
function detectRowHeader(matrix: string[][]): RowPlan | null {
  const limit = Math.min(matrix.length, 10)
  for (let r = 0; r < limit; r++) {
    const row = matrix[r] ?? []
    const roles = new Map<number, Role>()
    for (let c = 0; c < row.length; c++) {
      const role = roleOfHeader(row[c] ?? '')
      if (role) roles.set(c, role)
    }
    const has = (role: Role) => [...roles.values()].includes(role)
    const hasWhen = has('weekday') || has('date')
    const hasTime = has('start') || has('range')
    if (hasWhen && hasTime) return { headerIndex: r, roles }
  }
  return null
}

/**
 * Sans en-tête reconnaissable, on devine le rôle des colonnes à leur contenu :
 * une colonne pleine de jours est la colonne des jours, une colonne pleine
 * d'heures est une colonne d'heures. Le reste devient l'intitulé.
 */
function inferRowRoles(rows: string[][]): Map<number, Role> | null {
  const width = rows.reduce((max, r) => Math.max(max, r.length), 0)
  const roles = new Map<number, Role>()
  const sample = rows.slice(0, 40)
  const share = (c: number, test: (v: string) => boolean) => {
    let filled = 0, hits = 0
    for (const row of sample) {
      const v = (row[c] ?? '').trim()
      if (!v) continue
      filled++
      if (test(v)) hits++
    }
    return filled >= 2 ? hits / filled : 0
  }

  const timeCols: number[] = []
  for (let c = 0; c < width; c++) {
    if (share(c, (v) => parseWeekdayCell(v) !== null) > 0.7) { roles.set(c, 'weekday'); continue }
    if (share(c, (v) => weekdayFromDate(v) !== null) > 0.7) { roles.set(c, 'date'); continue }
    if (share(c, (v) => parseTimeRange(v) !== null) > 0.7) { roles.set(c, 'range'); continue }
    if (share(c, looksLikeTime) > 0.7) timeCols.push(c)
  }
  if (timeCols.length >= 1) roles.set(timeCols[0] as number, 'start')
  if (timeCols.length >= 2) roles.set(timeCols[1] as number, 'end')

  const kinds = [...roles.values()]
  if (!kinds.includes('weekday') && !kinds.includes('date')) return null
  if (!kinds.includes('start') && !kinds.includes('range')) return null

  for (let c = 0; c < width; c++) {
    if (!roles.has(c)) { roles.set(c, 'title'); break }
  }
  return roles
}

function slotsFromRows(matrix: string[][], plan: RowPlan | null, inferred: Map<number, Role> | null): RawSlot[] {
  const roles = plan ? plan.roles : (inferred as Map<number, Role>)
  const body = plan ? matrix.slice(plan.headerIndex + 1) : matrix
  const colOf = (role: Role) => [...roles.entries()].find(([, r]) => r === role)?.[0]
  const cWeekday = colOf('weekday'), cDate = colOf('date'), cStart = colOf('start')
  const cEnd = colOf('end'), cRange = colOf('range'), cLoc = colOf('location')
  let cTitle = colOf('title')
  if (cTitle === undefined) {
    // Pas de colonne d'intitulé annoncée : on prend la première colonne libre.
    const used = new Set(roles.keys())
    const width = body.reduce((max, r) => Math.max(max, r.length), 0)
    for (let c = 0; c < width; c++) if (!used.has(c)) { cTitle = c; break }
  }

  const slots: RawSlot[] = []
  for (const row of body) {
    const cell = (c: number | undefined) => (c === undefined ? '' : (row[c] ?? '').trim())
    const rawTitle = cleanTitle(cell(cTitle))
    let start: string | null = null
    let end: string | null = null
    if (cRange !== undefined) {
      const range = parseTimeRange(cell(cRange))
      if (range) { start = range.start; end = range.end } else start = parseTime(cell(cRange))
    }
    if (!start && cStart !== undefined) {
      const range = parseTimeRange(cell(cStart))
      if (range) { start = range.start; end = range.end } else start = parseTime(cell(cStart))
    }
    if (!end && cEnd !== undefined) end = parseTime(cell(cEnd))

    let weekday: number | null = null
    if (cWeekday !== undefined) weekday = parseWeekdayCell(cell(cWeekday))
    if (weekday === null && cDate !== undefined) weekday = weekdayFromDate(cell(cDate))
    if (weekday === null && cWeekday !== undefined) weekday = weekdayFromDate(cell(cWeekday))
    if (weekday === null && cDate !== undefined) weekday = parseWeekdayCell(cell(cDate))

    // Ligne vide (séparateur, total, pied de page) : on l'ignore sans bruit.
    if (!rawTitle && !start && weekday === null) continue
    if (!rawTitle && !start) continue

    slots.push({
      weekday,
      start,
      end,
      title: rawTitle,
      location: cLoc !== undefined ? cleanTitle(cell(cLoc)) || null : null,
    })
  }
  return slots
}

// ─────────────────────────────────────────────────────────────────────────────
// Disposition « grille » : jours en colonnes, heures en lignes
// ─────────────────────────────────────────────────────────────────────────────

/** Contenu de cellule qui n'est pas un créneau (séparateurs, pauses vides…) */
function isEmptyCell(value: string): boolean {
  const n = normalize(value)
  return n === '' || n === '-' || n === '--' || n === '/' || n === 'x' || n === '.'
}

interface GridPlan {
  headerIndex: number
  days: Map<number, number>
}

function detectGrid(matrix: string[][]): GridPlan | null {
  const limit = Math.min(matrix.length, 12)
  for (let r = 0; r < limit; r++) {
    const days = weekdayHeader(matrix[r] ?? [])
    if (days.size >= 3) return { headerIndex: r, days }
  }
  return null
}

/** Les jours sont-ils en lignes plutôt qu'en colonnes ? (grille transposée) */
function looksTransposed(matrix: string[][]): boolean {
  let dayRows = 0
  for (const row of matrix.slice(0, 20)) {
    if (parseWeekdayCell(row[0] ?? '') !== null) dayRows++
  }
  if (dayRows < 3) return false
  const header = matrix.find((row) => row.filter((c) => looksLikeTime(c) || parseTimeRange(c) !== null).length >= 2)
  return !!header
}

export function transpose(matrix: string[][]): string[][] {
  const width = matrix.reduce((max, r) => Math.max(max, r.length), 0)
  const out: string[][] = []
  for (let c = 0; c < width; c++) out.push(matrix.map((row) => row[c] ?? ''))
  return out
}

function slotsFromGrid(matrix: string[][], plan: GridPlan): RawSlot[] {
  const dayCols = [...plan.days.keys()].sort((a, b) => a - b)
  const firstDayCol = dayCols[0] ?? 0
  const body = matrix.slice(plan.headerIndex + 1)

  // 1. Heures de chaque ligne, lues dans les colonnes situées avant les jours.
  const times = body.map((row) => {
    for (let c = 0; c < firstDayCol; c++) {
      const range = parseTimeRange(row[c] ?? '')
      if (range) return range
    }
    let start: string | null = null
    let end: string | null = null
    for (let c = 0; c < firstDayCol; c++) {
      const t = parseTime(row[c] ?? '')
      if (!t) continue
      if (!start) start = t
      else if (!end) end = t
    }
    return start ? { start, end: end ?? '' } : null
  })

  // 2. Fin manquante → début de la ligne suivante (une grille horaire est continue).
  for (let i = 0; i < times.length; i++) {
    const t = times[i]
    if (!t || t.end) continue
    const next = times.slice(i + 1).find(Boolean)
    t.end = next ? next.start : minutesToTime(timeToMinutes(t.start) + 60)
  }

  // 3. Colonne par colonne, on fusionne les lignes voisines qui répètent le même
  //    intitulé : un cours de deux heures occupe deux lignes de la grille.
  const slots: RawSlot[] = []
  for (const col of dayCols) {
    const weekday = plan.days.get(col) as number
    let run: { title: string; from: number; to: number } | null = null
    const flush = () => {
      if (!run) return
      const from = times[run.from]
      const to = times[run.to]
      if (from) slots.push({ weekday, start: from.start, end: to?.end || from.end, title: run.title })
      run = null
    }
    for (let i = 0; i < body.length; i++) {
      const value = cleanTitle(body[i]?.[col] ?? '')
      if (!times[i] || isEmptyCell(value)) { flush(); continue }
      if (run && normalize(run.title) === normalize(value)) run.to = i
      else { flush(); run = { title: value, from: i, to: i } }
    }
    flush()
  }
  return slots
}

// ─────────────────────────────────────────────────────────────────────────────
// Disposition « lignes de texte » (PDF) : « Lundi 8h30-10h00 Maths »
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dernier recours, pour les fichiers sans structure de tableau : on lit chaque
 * ligne comme une phrase. Tout ce qui en sort est marqué « incertain ».
 */
export function slotsFromLines(lines: string[]): RawSlot[] {
  const slots: RawSlot[] = []
  let currentDay: number | null = null
  for (const line of lines) {
    const text = cleanTitle(line)
    if (!text) continue
    const day = findWeekday(text)
    // Une ligne qui ne contient qu'un jour sert d'en-tête aux lignes suivantes.
    if (day !== null && normalize(text).split(/[^a-z]+/).filter(Boolean).length <= 2 && !/\d/.test(text)) {
      currentDay = day
      continue
    }
    const range = findRangeInside(text) ?? wholeRange(text)
    if (!range) continue
    const title = cleanTitle(
      text
        .replace(range.raw, ' ')
        .replace(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/gi, ' ')
        .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, ''),
    )
    slots.push({ weekday: day ?? currentDay, start: range.start, end: range.end, title, uncertain: true })
  }
  return slots
}

const INLINE_RANGE_RE = /(\d{1,2}\s*(?:h|:)\s*\d{0,2})(?:\s*[-–—/]\s*|\s+(?:à|a|au)\s+)(\d{1,2}(?:\s*(?:h|:)\s*\d{0,2})?)/i

/** La ligne entière est une plage (« 8h30-10h00 ») */
function wholeRange(text: string): { start: string; end: string; raw: string } | null {
  const range = parseTimeRange(text)
  return range ? { ...range, raw: text } : null
}

function findRangeInside(text: string): { start: string; end: string; raw: string } | null {
  const m = INLINE_RANGE_RE.exec(text)
  if (!m) return null
  const start = parseTime(m[1] ?? '', true)
  const end = parseTime(m[2] ?? '', true)
  if (!start || !end) return null
  return { start, end, raw: m[0] }
}

// ─────────────────────────────────────────────────────────────────────────────
// Point d'entrée : un tableau de cellules → des créneaux candidats
// ─────────────────────────────────────────────────────────────────────────────

export interface MatrixResult {
  slots: RawSlot[]
  layout: Layout
  /**
   * Grille lue à l'envers : les jours en LIGNES, les heures en colonnes.
   * Absent quand la grille est dans le sens habituel — l'écran de relecture
   * annonce ce qui a vraiment été reconnu, pas la disposition la plus courante.
   */
  transposed?: true
}

/** Retire les lignes et colonnes entièrement vides, qui faussent toute détection */
export function trimMatrix(matrix: string[][]): string[][] {
  const rows = matrix.filter((row) => row.some((c) => (c ?? '').trim() !== ''))
  if (rows.length === 0) return []
  const width = rows.reduce((max, r) => Math.max(max, r.length), 0)
  const keep: number[] = []
  for (let c = 0; c < width; c++) if (rows.some((row) => (row[c] ?? '').trim() !== '')) keep.push(c)
  return rows.map((row) => keep.map((c) => (row[c] ?? '').trim()))
}

/** Choisit la disposition et en tire des créneaux bruts */
export function parseMatrix(input: string[][]): MatrixResult {
  const matrix = trimMatrix(input)
  if (matrix.length === 0) return { slots: [], layout: 'none' }

  const grid = detectGrid(matrix)
  const header = detectRowHeader(matrix)

  // La grille l'emporte quand la ligne d'en-tête EST la ligne des jours : dans
  // « Horaire | Lundi | Mardi… », les deux détections s'allument à la fois.
  if (grid && (!header || header.headerIndex === grid.headerIndex)) {
    const slots = slotsFromGrid(matrix, grid)
    if (slots.length > 0) return { slots, layout: 'grid' }
  }
  if (header) {
    const slots = slotsFromRows(matrix, header, null)
    if (slots.length > 0) return { slots, layout: 'rows' }
  }
  if (grid) {
    const slots = slotsFromGrid(matrix, grid)
    if (slots.length > 0) return { slots, layout: 'grid' }
  }
  const inferred = inferRowRoles(matrix)
  if (inferred) {
    const slots = slotsFromRows(matrix, null, inferred)
    if (slots.length > 0) return { slots, layout: 'rows' }
  }
  if (looksTransposed(matrix)) {
    const flipped = trimMatrix(transpose(matrix))
    const flippedGrid = detectGrid(flipped)
    if (flippedGrid) {
      const slots = slotsFromGrid(flipped, flippedGrid)
      if (slots.length > 0) return { slots, layout: 'grid', transposed: true }
    }
  }
  return { slots: [], layout: 'none' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dédoublonnage et contrôle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Créneaux bruts → brouillons éditables.
 * Un emploi du temps d'une année répète la même semaine des dizaines de fois :
 * les créneaux identiques sont fusionnés et comptés (`occurrences`), pour que
 * l'écran de relecture reste lisible.
 */
export function toDrafts(raws: RawSlot[]): SlotDraft[] {
  const byKey = new Map<string, SlotDraft>()
  for (const raw of raws) {
    const title = cleanTitle(raw.title)
    const truncated = title.slice(0, TITLE_MAX)
    const key = `${raw.weekday ?? 0}|${raw.start ?? ''}|${raw.end ?? ''}|${normalize(truncated)}`
    const seen = byKey.get(key)
    if (seen) { seen.occurrences++; continue }
    byKey.set(key, {
      key: `s${byKey.size}`,
      weekday: raw.weekday,
      start: raw.start ?? '',
      end: raw.end ?? '',
      title: truncated,
      location: raw.location ? cleanTitle(raw.location).slice(0, LOCATION_MAX) : null,
      occurrences: 1,
      uncertain: raw.uncertain === true || title.length > TITLE_MAX,
      selected: true,
    })
  }
  const drafts = [...byKey.values()]
  drafts.sort((a, b) => (a.weekday ?? 9) - (b.weekday ?? 9) || a.start.localeCompare(b.start))
  // Les lignes douteuses ne sont pas cochées d'office : rien ne part en base sans un regard.
  for (const d of drafts) {
    if (d.weekday === null || !d.start || !d.end || d.uncertain) d.selected = false
  }
  return drafts
}

const HHMM_RE = /^\d{2}:\d{2}$/

/** Empreinte d'un créneau : ce qui fait qu'il est « le même » qu'un autre */
function fingerprint(weekday: number, start: string, end: string, title: string): string {
  return `${weekday}|${start}|${end}|${normalize(title)}`
}

/** Empreintes des créneaux déjà enregistrés — la comparaison devient immédiate */
export function knownSlotKeys(existing: ExistingSlot[]): Set<string> {
  return new Set(
    existing.map((s) => fingerprint(s.weekday, s.start_time.slice(0, 5), s.end_time.slice(0, 5), s.title)),
  )
}

/** Cette ligne est-elle déjà dans l'emploi du temps ? */
export function isDuplicateDraft(draft: SlotDraft, known: ReadonlySet<string>): boolean {
  if (draft.weekday === null || known.size === 0) return false
  return known.has(fingerprint(draft.weekday, draft.start, draft.end, draft.title))
}

/**
 * Décoche les doublons que la relecture vient de révéler.
 *
 * `toDrafts` décoche d'office tout ce qui est douteux — rien ne part en base
 * sans un regard — mais il ne connaît pas l'emploi du temps déjà enregistré :
 * un doublon n'apparaît qu'à la relecture, une fois les créneaux existants en
 * main. Sans ça, ré-importer le même fichier proposait de tout ajouter une
 * seconde fois, toutes cases cochées.
 *
 * Le décochage a lieu à la PREMIÈRE relecture qui révèle le doublon, et à elle
 * seule : `traites` retient les clés déjà vues, pour qu'un doublon coché
 * sciemment (on peut vouloir dupliquer un créneau) ne se re-décoche jamais tout
 * seul, même après une correction ailleurs dans la liste. `traites` est un
 * ensemble mutable, tenu par l'appelant d'une relecture à l'autre.
 *
 * Renvoie le tableau reçu — la même référence — quand il n'y a rien à changer.
 */
export function unselectRevealedDuplicates(
  drafts: SlotDraft[],
  existing: ExistingSlot[],
  traites: Set<string>,
): SlotDraft[] {
  const known = knownSlotKeys(existing)
  if (known.size === 0) return drafts
  let change = false
  const suite = drafts.map((draft) => {
    if (traites.has(draft.key) || !isDuplicateDraft(draft, known)) return draft
    traites.add(draft.key)
    if (!draft.selected) return draft
    change = true
    return { ...draft, selected: false }
  })
  return change ? suite : drafts
}

/** Contrôle complet — rejoué à chaque correction dans l'écran de relecture */
export function reviewSlots(drafts: SlotDraft[], existing: ExistingSlot[] = []): ReviewedSlot[] {
  const known = knownSlotKeys(existing)

  const reviewed: ReviewedSlot[] = drafts.map((draft) => {
    const issues: IssueCode[] = []
    if (draft.weekday === null) issues.push('weekday-missing')
    if (!HHMM_RE.test(draft.start)) issues.push('start-missing')
    if (!HHMM_RE.test(draft.end)) issues.push('end-missing')
    if (!draft.title.trim()) issues.push('title-missing')
    if (draft.title.length >= TITLE_MAX) issues.push('title-truncated')

    if (HHMM_RE.test(draft.start) && HHMM_RE.test(draft.end)) {
      const span = timeToMinutes(draft.end) - timeToMinutes(draft.start)
      if (span <= 0) issues.push('end-before-start')
      else if (span > 8 * 60) issues.push('duration-long')
    }
    if (isDuplicateDraft(draft, known)) issues.push('duplicate')
    if (draft.uncertain) issues.push('uncertain')
    return { draft, issues, blocking: issues.some((i) => BLOCKING.has(i)) }
  })

  // Chevauchements : seulement entre lignes cochées et valides, sinon on
  // signalerait des conflits que l'utilisateur a déjà écartés.
  //
  // Rangés par jour, puis balayés dans l'ordre des débuts : deux créneaux de
  // jours différents ne peuvent pas se chevaucher, et sur un même jour il suffit
  // de comparer chaque ligne à celles encore ouvertes. Comparer toutes les
  // paires coûtait ~31 000 comparaisons sur une année de cours — à chaque frappe.
  const parJour = new Map<number, Plage[]>()
  for (const row of reviewed) {
    if (!row.draft.selected || row.blocking) continue
    const jour = row.draft.weekday as number
    const plage: Plage = { row, debut: timeToMinutes(row.draft.start), fin: timeToMinutes(row.draft.end) }
    const liste = parJour.get(jour)
    if (liste) liste.push(plage)
    else parJour.set(jour, [plage])
  }
  for (const liste of parJour.values()) {
    if (liste.length < 2) continue
    liste.sort((a, b) => a.debut - b.debut)
    /** Créneaux commencés et pas encore finis : ce sont les seuls à pouvoir chevaucher */
    const ouverts: Plage[] = []
    for (const plage of liste) {
      for (let k = ouverts.length - 1; k >= 0; k--) {
        if ((ouverts[k] as Plage).fin <= plage.debut) ouverts.splice(k, 1)
      }
      for (const ouvert of ouverts) { signaler(ouvert.row); signaler(plage.row) }
      ouverts.push(plage)
    }
  }
  return reviewed
}

/** Un créneau ramené à ses deux bornes en minutes, pour le balayage ci-dessus */
interface Plage {
  row: ReviewedSlot
  debut: number
  fin: number
}

function signaler(row: ReviewedSlot): void {
  if (!row.issues.includes('overlap')) row.issues.push('overlap')
}

/**
 * Phrase d'un enregistrement interrompu en cours de route.
 *
 * Elle vit ici, dans un module pur, parce qu'elle porte deux accords différents
 * dans la même phrase : « créneau**x** » prend un x, « ajouté**s** » prend un s.
 * Les confondre donnait « 200 créneaux sur 250 ont été ajoutéx » — une faute
 * bien visible, au pire moment. Un test la relit au singulier et au pluriel.
 */
export function partialFailureMessage(inserted: number, total: number): string {
  const many = inserted > 1
  return `${inserted} créneau${many ? 'x' : ''} sur ${total} ${many ? 'ont' : 'a'} été ajouté${many ? 's' : ''} avant l’échec.`
}

/** Lignes prêtes pour `schedule_slots` — uniquement ce qui est coché et valide */
export function toInsertRows(reviewed: ReviewedSlot[], userId: string, colorOf: (title: string) => string) {
  return reviewed
    .filter((r) => r.draft.selected && !r.blocking)
    .map((r) => ({
      user_id: userId,
      weekday: r.draft.weekday as number,
      start_time: `${r.draft.start}:00`,
      end_time: `${r.draft.end}:00`,
      title: r.draft.title.trim().slice(0, TITLE_MAX),
      location: r.draft.location ? r.draft.location.trim().slice(0, LOCATION_MAX) || null : null,
      color: colorOf(r.draft.title),
    }))
}
