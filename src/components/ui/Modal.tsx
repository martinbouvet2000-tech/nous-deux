import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { CARD_EDGE } from '@/lib/ui'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  /** Description optionnelle sous le titre */
  description?: string
}

/**
 * Modale accessible : role=dialog, focus piégé grossièrement (focus initial + Escape),
 * fermeture au clic sur le fond.
 */
export default function Modal({ title, description, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = `modal-title-${title.replace(/\s+/g, '-').toLowerCase()}`

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.activeElement as HTMLElement | null
    // Focus sur le premier champ interactif
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])')
    first?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] w-full max-w-md space-y-4 max-h-[90dvh] overflow-y-auto"
        style={{ animation: 'fadeIn 300ms ease-out' }}
      >
        <div className={CARD_EDGE} />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id={titleId} className="text-sm font-medium tracking-wide text-[#F0EAE0]">{title}</h3>
            {description && <p className="text-xs tracking-wide text-[#8A8177] mt-1 leading-relaxed">{description}</p>}
          </div>
          <button
            data-close
            onClick={onClose}
            className="text-[#8A8177] hover:text-[#F0EAE0] transition-colors duration-300 shrink-0"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
