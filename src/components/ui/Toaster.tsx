import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { useToastStore } from '@/lib/toast'

const STYLES = {
  success: { icon: CheckCircle2, ring: 'rgba(16,185,129,0.35)', color: '#34D399' },
  error: { icon: AlertCircle, ring: 'rgba(239,68,68,0.35)', color: '#F87171' },
  info: { icon: Info, ring: 'rgba(212,165,116,0.35)', color: '#D4A574' },
} as const

export default function Toaster() {
  const { toasts, dismiss, pause, resume } = useToastStore()
  // La région live existe en permanence (annonces fiables), même vide
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6 z-[90] flex flex-col gap-2 w-[min(92vw,380px)] pointer-events-none"
      role="status"
      aria-live="polite"
      aria-atomic="false"
      aria-label="Notifications"
    >
      {toasts.map((t) => {
        const S = STYLES[t.kind]
        const Icon = S.icon
        return (
          <div
            key={t.id}
            onMouseEnter={() => pause(t.id)}
            onMouseLeave={() => resume(t.id)}
            onFocus={() => pause(t.id)}
            onBlur={() => resume(t.id)}
            className="pointer-events-auto flex items-start gap-3 rounded-2xl bg-[#1E1B17]/95 backdrop-blur-xl px-4 py-3 animate-slide-up"
            style={{ boxShadow: `0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px ${S.ring}` }}
          >
            <Icon size={18} className="shrink-0 mt-0.5" style={{ color: S.color }} aria-hidden="true" />
            <p className="flex-1 text-sm text-[#F0EAE0] leading-snug">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="-m-1.5 p-1.5 shrink-0 rounded-lg text-[#9B9287] hover:text-[#F0EAE0] transition-colors"
              aria-label="Fermer la notification"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
