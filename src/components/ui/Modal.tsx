import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { CARD_EDGE } from '@/lib/ui'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  description?: string
  /** Dialogue d'alerte (confirmation) */
  alert?: boolean
}

let openCount = 0

/**
 * Modale accessible rendue dans un portail (au-dessus de la nav mobile) :
 * role=dialog, aria-labelledby/describedby, piège de focus, fond inerte,
 * verrouillage du scroll, Escape (seulement la dernière ouverte), clic sur le fond.
 */
export default function Modal({ title, description, onClose, children, alert = false }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  // onClose est souvent une fonction inline recréée à chaque rendu du parent.
  // On la garde dans une ref pour que l'effet de montage ne se relance PAS à
  // chaque frappe (sinon ref.current.focus() volait le focus de l'input).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    openCount++
    const myIndex = openCount
    const prevFocus = document.activeElement as HTMLElement | null
    const root = document.getElementById('root')
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (openCount === 1) root?.setAttribute('inert', '')

    // Focus initial : le conteneur (titre + description annoncés), puis Tab va au premier champ
    ref.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (myIndex !== openCount) return // une modale plus récente est ouverte
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); return }
      if (e.key !== 'Tab') return
      const f = ref.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')
      if (!f?.length) { e.preventDefault(); return }
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      openCount--
      if (openCount === 0) { root?.removeAttribute('inert'); document.body.style.overflow = prevOverflow }
      prevFocus?.focus?.()
    }
    // Montage/démontage uniquement — surtout PAS [onClose] (voir onCloseRef ci-dessus).
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#0A0908]/72 backdrop-blur-md"
      style={{ animation: 'fadeIn 200ms ease-out' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="lux-card relative overflow-hidden rounded-[28px] sm:rounded-[24px] p-5 md:p-6 w-full max-w-md space-y-4 max-h-[88dvh] overflow-y-auto outline-none shadow-[0_-24px_60px_rgba(0,0,0,0.6)]"
        style={{ animation: 'sheetIn 420ms cubic-bezier(0.2,0,0,1)' }}
      >
        <div className={CARD_EDGE} aria-hidden="true" />
        <div className="mx-auto h-1 w-9 rounded-full bg-[#F0EAE0]/15 sm:hidden -mt-1" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="font-display text-[22px] leading-tight text-[#F0EAE0]">{title}</h2>
            {description && <p id={descId} className="text-[13px] text-[#9B9287] mt-1.5 leading-relaxed">{description}</p>}
          </div>
          {/* Visuel inchangé (icône 18 px, -m-2 p-2) ; « tap-44 » porte la zone tactile à 44 px. */}
          <button
            data-close
            onClick={onClose}
            className="tap-44 -m-2 p-2 inline-flex items-center justify-center rounded-full text-[#9B9287] hover:text-[#F0EAE0] hover:bg-white/[0.06] transition-colors duration-200 shrink-0"
            aria-label="Fermer"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
