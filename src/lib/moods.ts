import type { MoodState } from '@/types/database'

/**
 * Les 12 états d’humeur & énergie (mascotte hamster). Une seule source de vérité.
 * Les libellés sont tous des noms (« Joie », « Fatigue »…) : ils se lisent aussi bien
 * en tête du sélecteur qu’en pastille sous le hamster.
 */
export interface MoodDef {
  key: MoodState
  label: string
  /** Sous-titre qui explicite les nuances */
  hint: string
  /** Emoji de repli (export, notifications, anciens clients) */
  emoji: string
  /** Couleur d’ambiance (fond vivant) */
  glow: string
  /** Teinte pour la pastille */
  tint: string
}

export const MOODS: MoodDef[] = [
  { key: 'joyful',   label: 'Joie',            hint: 'Joyeux·se, satisfait·e',                  emoji: '😊', glow: 'rgba(232,184,109,0.22)', tint: '#E8B86D' },
  { key: 'proud',    label: 'Fierté',          hint: 'Fier·ère, sûr·e de soi, optimiste',       emoji: '🤩', glow: 'rgba(240,160,90,0.22)',  tint: '#F0A05A' },
  { key: 'excited',  label: 'Impatience',      hint: 'Excité·e, hâte de te retrouver',          emoji: '🤗', glow: 'rgba(244,180,92,0.22)',  tint: '#F4B45C' },
  { key: 'love',     label: 'Amour',           hint: 'Le cœur qui déborde, tu me manques',      emoji: '🥰', glow: 'rgba(230,138,168,0.24)', tint: '#E68AA8' },
  { key: 'peaceful', label: 'Sérénité',        hint: 'Serein·e, apaisé·e, bien-être',           emoji: '😌', glow: 'rgba(143,179,169,0.22)', tint: '#8FB3A9' },
  { key: 'focused',  label: 'Concentration',   hint: 'Dans la routine, au travail',             emoji: '🧐', glow: 'rgba(212,165,116,0.18)', tint: '#D4A574' },
  { key: 'tired',    label: 'Fatigue',         hint: 'Fatigué·e, à plat',                       emoji: '😴', glow: 'rgba(155,156,199,0.22)', tint: '#9B9CC7' },
  { key: 'bored',    label: 'Ennui',           hint: 'La journée traîne, tu me manques'      , emoji: '🥱', glow: 'rgba(169,166,199,0.2)',  tint: '#A9A6C7' },
  { key: 'sick',     label: 'Petite forme',    hint: 'Malade, pas en forme',                    emoji: '🤒', glow: 'rgba(156,185,138,0.22)', tint: '#9CB98A' },
  { key: 'stressed', label: 'Stress',          hint: 'Stressé·e, débordé·e',                    emoji: '😰', glow: 'rgba(194,120,142,0.22)', tint: '#C2788E' },
  { key: 'angry',    label: 'Énervement',      hint: 'Énervé·e, à cran',                        emoji: '😤', glow: 'rgba(217,123,108,0.22)', tint: '#D97B6C' },
  { key: 'down',     label: 'Tristesse',       hint: 'Triste, en manque, le moral en berne',    emoji: '😔', glow: 'rgba(130,140,170,0.2)',  tint: '#8A94B0' },
]

export const MOOD_BY_KEY: Record<MoodState, MoodDef> = Object.fromEntries(MOODS.map((m) => [m.key, m])) as Record<MoodState, MoodDef>

/** Retrouve une définition à partir d’une ligne `moods` (état ou, à défaut, emoji historique) */
export function moodFromRow(row: { state?: string | null; emoji?: string | null } | null | undefined): MoodDef | null {
  if (!row) return null
  if (row.state && row.state in MOOD_BY_KEY) return MOOD_BY_KEY[row.state as MoodState]
  const legacy: Record<string, MoodState> = { '😊': 'joyful', '🤩': 'proud', '💪': 'proud', '🥳': 'excited', '🤗': 'excited', '🥰': 'love', '❤️': 'love', '😍': 'love', '😌': 'peaceful', '🧐': 'focused', '😴': 'tired', '🥱': 'bored', '😐': 'bored', '🤒': 'sick', '🤢': 'sick', '😰': 'stressed', '😤': 'angry', '😠': 'angry', '😡': 'angry', '😔': 'down', '😢': 'down' }
  const k = row.emoji ? legacy[row.emoji] : undefined
  return k ? MOOD_BY_KEY[k] : null
}
