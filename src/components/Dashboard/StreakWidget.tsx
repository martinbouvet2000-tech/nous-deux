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
    <div className="group relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] transition-all duration-500 ease-out hover:bg-[#252118] hover:shadow-[0_8px_48px_rgba(0,0,0,0.3),0_0_0_1px_rgba(212,165,116,0.04)] text-center">
      {/* Top glow line */}
      <div
        className="absolute top-0 left-[15%] right-[15%] h-px transition-opacity duration-500 ease-out opacity-60 group-hover:opacity-100"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(212, 165, 116, 0.12), transparent)' }}
      />

      {/* Label */}
      <p className="text-sm font-medium tracking-wide uppercase text-[#9B9287] mb-4">
        Ensemble
      </p>

      {/* Hero number */}
      <div className="mb-1">
        <p
          className="text-5xl font-light tabular-nums leading-none text-[#F0EAE0]"
          style={{
            textShadow: '0 0 30px rgba(212, 165, 116, 0.15), 0 0 60px rgba(194, 120, 142, 0.08)',
          }}
        >
          {daysTogether}
        </p>
      </div>

      <p className="text-[11px] text-[#6B6359] font-medium tracking-wider uppercase">
        jours
      </p>

      {/* Milestone */}
      {milestone && (
        <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[rgba(255,255,255,0.03)]">
          <span className="text-sm leading-none">{milestone.emoji}</span>
          <span className="text-[11px] font-medium text-[#9B9287]">
            {milestone.label}
          </span>
        </div>
      )}

      {/* Start date */}
      {startFormatted && (
        <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center justify-center gap-1.5">
          <Heart size={9} className="text-[#C2788E]/40" />
          <p className="text-[10px] text-[#6B6359] tracking-wide">
            Depuis le {startFormatted}
          </p>
        </div>
      )}
    </div>
  )
}
