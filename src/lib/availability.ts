import type { AvailabilityStatus } from '@/types/database'

export interface StatusDef {
  key: AvailabilityStatus
  label: string
  hint: string
  /** Couleur du drapeau */
  color: string
  /** Couleur plus sombre pour l’ombre du tissu */
  shade: string
}

/**
 * Les états du drapeau d’appel, dans l’ordre d’affichage du sélecteur.
 * Chaque `hint` décrit ta situation (jamais un message adressé à l’autre) :
 * le sélecteur demande « Là, maintenant, tu es… ».
 */
export const STATUSES: StatusDef[] = [
  { key: 'free',          label: 'Dispo',                    hint: 'Libre tout de suite',                color: '#7FCB9A', shade: '#4F9A6B' },
  { key: 'soon',          label: 'Bientôt dispo',            hint: 'Encore un petit moment',             color: '#F0A05A', shade: '#B86F33' },
  { key: 'with_people',   label: 'Dispo, avec des proches',  hint: 'Potes ou famille autour',             color: '#E9CD5A', shade: '#B39A2E' },
  { key: 'busy_activity', label: 'Dispo, en activité',       hint: 'Travail, sport… mais joignable',      color: '#6FA8DC', shade: '#3F78AC' },
  { key: 'on_call',       label: 'En appel',                 hint: 'Déjà en ligne',                       color: '#A98BD6', shade: '#7A5BA8' },
  { key: 'unavailable',   label: 'Pas dispo',                hint: 'Pas joignable pour le moment',        color: '#9B9287', shade: '#6E675E' },
]

export const STATUS_BY_KEY: Record<AvailabilityStatus, StatusDef> = Object.fromEntries(STATUSES.map((s) => [s.key, s])) as Record<AvailabilityStatus, StatusDef>

/** Au-delà de ce délai sans mise à jour, on considère l’info comme périmée (drapeau atténué) */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000
