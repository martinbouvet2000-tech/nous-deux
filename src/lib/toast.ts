import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastState {
  toasts: Toast[]
  push: (kind: ToastKind, message: string, durationMs?: number) => void
  dismiss: (id: number) => void
  pause: (id: number) => void
  resume: (id: number) => void
}

let nextId = 1
const timers = new Map<number, { handle: ReturnType<typeof setTimeout>; remaining: number; started: number }>()

/** Durée de lecture : ≥ 5 s, + 350 ms par mot (WCAG 2.2.1) */
const readingTime = (m: string) => Math.max(5000, m.trim().split(/\s+/).length * 350)

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, message, durationMs) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message }] }))
    const ms = durationMs ?? readingTime(message)
    const handle = setTimeout(() => get().dismiss(id), ms)
    timers.set(id, { handle, remaining: ms, started: Date.now() })
  },
  dismiss: (id) => {
    const t = timers.get(id); if (t) { clearTimeout(t.handle); timers.delete(id) }
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
}))

export const toast = {
  success: (m: string) => useToastStore.getState().push('success', m),
  error: (m: string) => useToastStore.getState().push('error', m),
  info: (m: string) => useToastStore.getState().push('info', m),
}
