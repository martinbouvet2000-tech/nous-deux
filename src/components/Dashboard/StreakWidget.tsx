import { Flame } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { differenceInDays } from 'date-fns'

export default function StreakWidget() {
  const { profile } = useAuthStore()

  const coupleStartDate = profile?.created_at
  const daysTogether = coupleStartDate
    ? differenceInDays(new Date(), new Date(coupleStartDate))
    : 0

  return (
    <div className="card text-center">
      <div className="flex items-center justify-center gap-2 mb-2">
        <Flame size={16} className="text-accent" />
        <h3 className="text-sm font-semibold">Ensemble</h3>
      </div>
      <p className="text-4xl font-bold gradient-text">{daysTogether}</p>
      <p className="text-xs text-text-muted mt-1">jours</p>
    </div>
  )
}
