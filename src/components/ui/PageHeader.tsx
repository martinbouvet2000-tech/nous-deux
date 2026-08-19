import type { ReactNode } from 'react'
import { EYEBROW } from '@/lib/ui'

interface Props {
  /** Sur-titre micro-capitales (ex : "Votre espace") */
  eyebrow?: string
  /** Titre — un mot peut être mis en valeur via `accent` */
  title: string
  accent?: string
  subtitle?: string
  /** Action primaire de la page (bouton) — vit ici et nulle part ailleurs */
  action?: ReactNode
  /** Sous-navigation (onglets) rendue sous le titre */
  tabs?: ReactNode
}

/** En-tête de page éditorial commun à toutes les pages (même vocabulaire que l'accueil). */
export default function PageHeader({ eyebrow, title, accent, subtitle, action, tabs }: Props) {
  return (
    <header className="pt-2 md:pt-4 pb-2 reveal">
      {eyebrow && (
        <div className="flex items-center gap-3 mb-3" aria-hidden="true">
          <span className="h-px w-10 bg-gradient-to-r from-transparent to-[#D4A574]/35" />
          <span className={EYEBROW}>{eyebrow}</span>
          <span className="h-px flex-1 max-w-[80px] bg-gradient-to-l from-transparent to-[#D4A574]/35" />
        </div>
      )}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[2rem] md:text-[2.4rem] leading-[1.05] text-[#F0EAE0] text-balance">
            {title}{accent && <> <em className="font-display-italic text-[#D4A574]">{accent}</em></>}
          </h1>
          {subtitle && <p className="mt-2 text-[13px] text-[#9B9287] max-w-[46ch] leading-relaxed">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {tabs && <div className="mt-5">{tabs}</div>}
    </header>
  )
}
