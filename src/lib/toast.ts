import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
  /** Clé de dédoublonnage : deux toasts de même clé ne coexistent jamais à l'écran */
  key: string
  /** Horodatage de création (ms) — sert à épargner un toast tout juste né lors d'une navigation */
  createdAt: number
}

export interface ToastOptions {
  /** Durée d'affichage forcée (ms). Par défaut : temps de lecture calculé. */
  durationMs?: number
  /**
   * Clé de dédoublonnage explicite. Utile quand le libellé varie (compteur, prénom)
   * mais que le message reste « le même » du point de vue de l'utilisateur.
   * Par défaut : type + texte.
   */
  key?: string
}

/**
 * Au-delà de 3, la pile mange l'écran et plus personne ne lit rien.
 * On garde les plus récents : ce sont eux qui décrivent la situation actuelle.
 */
export const MAX_VISIBLE = 3

/**
 * Un toast né juste avant un changement de page est la réponse à l'action qui a
 * provoqué la navigation (« Mot de passe mis à jour », « Vous êtes liés »). On le
 * laisse vivre ; tous les autres appartiennent à la page qu'on vient de quitter.
 */
export const NAV_GRACE_MS = 1000

interface ToastState {
  toasts: Toast[]
  /**
   * Faux tant que personne n'est connecté. Un message né dans l'app (erreur de
   * géolocalisation, échec de requête) n'a rien à faire par-dessus l'écran de
   * connexion : hors session, `push` ne fait rien.
   */
  authenticated: boolean
  push: (kind: ToastKind, message: string, opts?: ToastOptions) => void
  dismiss: (id: number) => void
  pause: (id: number) => void
  resume: (id: number) => void
  /** Vide la pile et ses minuteurs (déconnexion, changement d'utilisateur) */
  clear: () => void
  /** Changement de page : les messages de la page quittée n'ont plus de contexte */
  clearForNavigation: () => void
  /** Ouvre ou ferme le robinet selon l'état de la session (piloté par App) */
  setAuthenticated: (value: boolean) => void
}

let nextId = 1
const timers = new Map<number, { handle: ReturnType<typeof setTimeout>; remaining: number; started: number }>()

/** Durée de lecture : ≥ 5 s, + 350 ms par mot (WCAG 2.2.1) */
const readingTime = (m: string) => Math.max(5000, m.trim().split(/\s+/).length * 350)

/** Coupe le minuteur d'un toast sans toucher à la liste affichée */
function stopTimer(id: number): void {
  const t = timers.get(id)
  if (!t) return
  clearTimeout(t.handle)
  timers.delete(id)
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  authenticated: false,

  push: (kind, message, opts = {}) => {
    const text = message.trim()
    if (!text || !get().authenticated) return

    const key = opts.key ?? `${kind}:${text}`
    const ms = opts.durationMs ?? readingTime(text)

    // Déjà à l'écran : on n'empile pas un doublon, on relance simplement sa lecture.
    // (Hors ligne, quatre écrans échouaient ensemble et affichaient quatre fois
    // « Pas de connexion » — un seul message suffit.)
    const existing = get().toasts.find((t) => t.key === key)
    if (existing) {
      stopTimer(existing.id)
      timers.set(existing.id, {
        handle: setTimeout(() => get().dismiss(existing.id), ms),
        remaining: ms,
        started: Date.now(),
      })
      return
    }

    const id = nextId++
    set((s) => {
      const next = [...s.toasts, { id, kind, message: text, key, createdAt: Date.now() }]
      // Plafond : les plus anciens sortent, minuteur compris.
      const excess = next.length - MAX_VISIBLE
      if (excess > 0) next.splice(0, excess).forEach((t) => stopTimer(t.id))
      return { toasts: next }
    })
    timers.set(id, { handle: setTimeout(() => get().dismiss(id), ms), remaining: ms, started: Date.now() })
  },

  dismiss: (id) => {
    stopTimer(id)
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
  },

  pause: (id) => {
    const t = timers.get(id); if (!t) return
    clearTimeout(t.handle)
    t.remaining = Math.max(1500, t.remaining - (Date.now() - t.started))
  },

  resume: (id) => {
    const t = timers.get(id); if (!t) return
    t.started = Date.now()
    t.handle = setTimeout(() => get().dismiss(id), t.remaining)
  },

  clear: () => {
    const { toasts } = get()
    if (!toasts.length) return
    toasts.forEach((t) => stopTimer(t.id))
    set({ toasts: [] })
  },

  clearForNavigation: () => {
    const { toasts } = get()
    if (!toasts.length) return
    const cutoff = Date.now() - NAV_GRACE_MS
    const kept = toasts.filter((t) => t.createdAt > cutoff)
    if (kept.length === toasts.length) return
    toasts.forEach((t) => { if (!kept.includes(t)) stopTimer(t.id) })
    set({ toasts: kept })
  },

  setAuthenticated: (value) => {
    if (get().authenticated === value) return
    // À la déconnexion, rien ne doit survivre : l'écran suivant est celui de connexion.
    if (!value) get().clear()
    set({ authenticated: value })
  },
}))

export const toast = {
  success: (m: string, opts?: ToastOptions) => useToastStore.getState().push('success', m, opts),
  error: (m: string, opts?: ToastOptions) => useToastStore.getState().push('error', m, opts),
  info: (m: string, opts?: ToastOptions) => useToastStore.getState().push('info', m, opts),
  /** Purge immédiate — à utiliser quand le contexte disparaît (déconnexion) */
  clear: () => useToastStore.getState().clear(),
}
