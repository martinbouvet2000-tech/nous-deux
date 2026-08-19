import type { MoodState } from '@/types/database'

/** Les 7 états d'humeur & énergie (mascotte hamster). Une seule source de vérité. */
export interface MoodDef {
  key: MoodState
  label: string
  /** Sous-titre qui explicite les nuances */
  hint: string
  /** Emoji de repli (export, notifications, anciens clients) */
  emoji: string
  /** Couleur d'ambiance (fond vivant) */
  glow: string
  /** Teinte pour la pastille */
  tint: string
}

export const MOODS: MoodDef[] = [
  { key: 'joyful',   label: 'Joyeux·se',      hint: 'Satisfait·e, de bonne humeur',            emoji: '😊', glow: 'rgba(232,184,109,0.22)', tint: '#E8B86D' },
  { key: 'proud',    label: 'Fier·ère',        hint: 'Énergique, optimiste',                   emoji: '🤩', glow: 'rgba(240,160,90,0.22)',  tint: '#F0A05A' },
  { key: 'peaceful', label: 'Serein·e',        hint: 'Bien-être, peaceful',                     emoji: '😌', glow: 'rgba(143,179,169,0.22)', tint: '#8FB3A9' },
  { key: 'tired',    label: 'Fatigué·e',       hint: 'Ou un peu malade',                        emoji: '😴', glow: 'rgba(155,156,199,0.22)', tint: '#9B9CC7' },
  { key: 'stressed', label: 'Stressé·e',       hint: 'Débordé·e',                               emoji: '😰', glow: 'rgba(194,120,142,0.22)', tint: '#C2788E' },
  { key: 'focused',  label: 'Concentré·e',     hint: 'Dans la routine, au travail',             emoji: '🧐', glow: 'rgba(212,165,116,0.18)', tint: '#D4A574' },
  { key: 'down',     label: 'Pas au top',      hint: 'Triste, en manque, en colère, soulé·e',   emoji: '😔', glow: 'rgba(130,140,170,0.2)',  tint: '#8A94B0' },
]

export const MOOD_BY_KEY: Record<MoodState, MoodDef> = Object.fromEntries(MOODS.map((m) => [m.key, m])) as Record<MoodState, MoodDef>

/** Retrouve une définition à partir d'une ligne `moods` (état ou, à défaut, emoji historique) */
export function moodFromRow(row: { state?: string | null; emoji?: string | null } | null | undefined): MoodDef | null {
  if (!row) return null
  if (row.state && row.state in MOOD_BY_KEY) return MOOD_BY_KEY[row.state as MoodState]
  const legacy: Record<string, MoodState> = { '😊': 'joyful', '🥰': 'joyful', '🤩': 'proud', '🥳': 'proud', '😌': 'peaceful', '😴': 'tired', '🤒': 'tired', '😰': 'stressed', '😤': 'down', '😔': 'down' }
  const k = row.emoji ? legacy[row.emoji] : undefined
  return k ? MOOD_BY_KEY[k] : null
}
