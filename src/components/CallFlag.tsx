import type { AvailabilityStatus } from '@/types/database'
import { STATUS_BY_KEY } from '@/lib/availability'

interface Props {
  status: AvailabilityStatus | null
  size?: number
  /** Drapeau qui ondule doucement (désactivé en reduced-motion via CSS) */
  wave?: boolean
  /** Information périmée ou absente : drapeau atténué */
  dim?: boolean
  className?: string
}

/**
 * Drapeau d'appel : un mât, un tissu coloré par le statut, une ombre douce.
 * Le tissu ondule via une animation de chemin SVG (deux formes alternées).
 */
export default function CallFlag({ status, size = 64, wave = true, dim = false, className = '' }: Props) {
  const def = status ? STATUS_BY_KEY[status] : null
  const color = def?.color ?? '#3A342F'
  const shade = def?.shade ?? '#2A2523'
  const id = `flag-${status ?? 'none'}`
  return (
    <svg viewBox="0 0 80 96" width={size} height={size * 1.2} className={className} aria-hidden="true" style={dim ? { opacity: 0.5, filter: 'saturate(0.4)' } : undefined}>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={color} />
          <stop offset="1" stopColor={shade} />
        </linearGradient>
        <linearGradient id={`${id}-pole`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#F0D4A8" />
          <stop offset="0.5" stopColor="#D4A574" />
          <stop offset="1" stopColor="#A37A4E" />
        </linearGradient>
      </defs>
      {/* ombre au sol */}
      <ellipse cx="18" cy="92" rx="12" ry="2.5" fill="#000" opacity="0.35" />
      {/* mât */}
      <rect x="15" y="8" width="4" height="84" rx="2" fill={`url(#${id}-pole)`} />
      <circle cx="17" cy="7" r="4" fill="#E8C9A0" />
      {/* tissu */}
      <path fill={`url(#${id}-g)`} className={wave ? 'flag-cloth' : undefined}
        d="M19 12 C 34 6, 48 18, 66 12 L 66 48 C 48 54, 34 42, 19 48 Z">
        {wave && (
          <animate attributeName="d" dur="3.6s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
            values="M19 12 C 34 6, 48 18, 66 12 L 66 48 C 48 54, 34 42, 19 48 Z;M19 12 C 34 18, 48 6, 66 12 L 66 48 C 48 42, 34 54, 19 48 Z;M19 12 C 34 6, 48 18, 66 12 L 66 48 C 48 54, 34 42, 19 48 Z" />
        )}
      </path>
      {/* reflet */}
      <path d="M22 16 C 34 11, 46 20, 60 16 L 60 22 C 46 26, 34 17, 22 22 Z" fill="#fff" opacity="0.14" />
    </svg>
  )
}
