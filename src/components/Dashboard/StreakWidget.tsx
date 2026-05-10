import { Flame, Heart } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { differenceInDays, format } from 'date-fns'
import { fr } from 'date-fns/locale'

function getMilestone(days: number): { emoji: string; label: string } | null {
  if (days >= 365) return { emoji: '💎', label: `${Math.floor(days / 365)} an${Math.floor(days / 365) > 1 ? 's' : ''}` }
  if (days >= 180) return { emoji: '🔥', label: '6 mois' }
  if (days >= 100) return { emoji: '💯', label: '100 jours' }
  if (days >= 30) return { emoji: '🌙', label: `${Math.floor(days / 30)} mois` }
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
    <div className="card-glow text-center relative">
      <div className="flex items-center justify-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center">
          <Flame size={15} className="text-accent" />
        </div>
        <h3 className="text-sm font-semibold">Ensemble</h3>
      </div>

      {/* Big number */}
      <div className="relative inline-block mb-2">
        <p className="text-5xl font-extrabold gradient-text-warm tabular-nums">{daysTogether}</p>
        {/* Decorative ring */}
        <div className="absolute -inset-4 rounded-full border border-dashed border-accent/15 animate-spin-slow pointer-events-none" />
      </div>
      <p className="text-xs text-text-muted font-medium">jours</p>

      {/* Milestone badge */}
      {milestone && (
        <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 border border-accent/15">
          <span className="text-sm">{milestone.emoji}</span>
          <span className="text-[11px] font-semibold text-accent-light">{milestone.label}</span>
        </div>
      )}

      {/* Start date */}
      {startFormatted && (
        <div className="mt-3 pt-3 border-t border-surface-lighter/50 flex items-center justify-center gap-1.5">
          <Heart size={10} className="text-secondary" />
          <p className="text-[10px] text-text-dim">Depuis le {startFormatted}</p>
        </div>
      )}
    </div>
  )
}
