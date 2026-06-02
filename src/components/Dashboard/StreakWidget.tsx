import { Heart } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { differenceInDays, format } from 'date-fns'
import { fr } from 'date-fns/locale'

function getMilestone(days: number): { emoji: string; label: string } | null {
  if (days >= 365) return { emoji: '\u{1F48E}', label: `${Math.floor(days / 365)} an${Math.floor(days / 365) > 1 ? 's' : ''}` }
  if (days >= 180) return { emoji: '\u{1F525}', label: '6 mois' }
  if (days >= 100) return { emoji: '\u{1F4AF}', label: '100 jours' }
  if (days >= 30) return { emoji: '\u{1F319}', label: `${Math.floor(days / 30)} mois` }
  if (days >= 7) return { emoji: '⭐', label: `${Math.floor(days / 7)} sem.` }
  return null
}

export default function StreakWidget() {
  const { profile } = useAuthStore()

  const coupleStartDate = profile?.created_at
  const daysTogether = coupleStartDate
    ? differenceInDays(new Date(), new Date(coupleStartDate))
    : 0

  const milestone = getMilestone(daysTogether)
  const startFormatted = coupleStartDate
    ? format(new Date(coupleStartDate), 'd MMMM yyyy', { locale: fr })
    : null

  return (
    <div className="card text-center relative">
      {/* Section label */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <Heart size={13} className="text-secondary/70" />
        <h3 className="text-xs font-medium tracking-wide uppercase text-text-muted">
          Ensemble
        </h3>
      </div>

      {/* Big number — refined gradient, no spinning ring */}
      <div className="mb-1">
        <p
          className="text-5xl font-bold tabular-nums leading-none"
          style={{
            background: 'linear-gradient(160deg, rgba(167,139,250,0.95), rgba(244,114,182,0.8))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {daysTogether}
        </p>
      </div>

      <p className="text-[11px] text-text-muted font-medium tracking-wider uppercase">
        jours
      </p>

      {/* Milestone badge — minimal, no border */}
      {milestone && (
        <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04]">
          <span className="text-sm leading-none">{milestone.emoji}</span>
          <span className="text-[11px] font-medium text-text-muted">
            {milestone.label}
          </span>
        </div>
      )}

      {/* Start date — subtle footer */}
      {startFormatted && (
        <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center justify-center gap-1.5">
          <Heart size={9} className="text-secondary/40" />
          <p className="text-[10px] text-text-dim tracking-wide">
            Depuis le {startFormatted}
          </p>
        </div>
      )}
    </div>
  )
}
