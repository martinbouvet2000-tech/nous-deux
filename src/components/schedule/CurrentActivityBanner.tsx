import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Briefcase, Dumbbell, Utensils, Moon, Clock, type LucideIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { ScheduleSlot } from '@/types/database'
import { run } from '@/lib/db'
import { getCurrentSlot, slotIconKind, currentSlotPhrase, shortTime, type SlotIconKind } from '@/lib/schedule'

const ICONS: Record<SlotIconKind, LucideIcon> = {
  book: BookOpen, work: Briefcase, sport: Dumbbell, meal: Utensils, night: Moon, clock: Clock,
}

/**
 * Bannière autonome : « Clarisse est en cours de maths · jusqu'à 16:00 ».
 * Charge les créneaux du partenaire, calcule l'heure locale DU PARTENAIRE (son fuseau),
 * se rafraîchit toutes les 60 s et via realtime. Rend `null` s'il n'y a rien à dire.
 */
export default function CurrentActivityBanner({ className = '' }: { className?: string }) {
  const { partnerProfile } = useAuthStore()
  const partnerId = partnerProfile?.id
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [now, setNow] = useState(() => new Date())

  const fetchSlots = useCallback(async () => {
    if (!partnerId) return
    const { data } = await run(
      supabase.from('schedule_slots').select('*').eq('user_id', partnerId),
      { silent: true },
    )
    if (data) setSlots(data)
  }, [partnerId])

  useEffect(() => {
    if (!partnerId) return
    fetchSlots()
    const channel = supabase
      .channel(`schedule-banner:${partnerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_slots', filter: `user_id=eq.${partnerId}` }, () => fetchSlots())
      .subscribe()
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => { supabase.removeChannel(channel); window.clearInterval(timer) }
  }, [fetchSlots, partnerId])

  if (!partnerProfile || slots.length === 0) return null

  const { current, next } = getCurrentSlot(slots, partnerProfile.timezone, now)
  if (!current && !next) return null

  const name = partnerProfile.display_name
  const Icon = ICONS[slotIconKind((current ?? next)!.title)]

  return (
    <div
      className={`lux-card relative overflow-hidden rounded-full min-h-[52px] px-4 py-2.5 flex items-center gap-3 ${className}`}
      aria-live="polite"
      role="status"
    >
      <span
        className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#D4A574]/15 to-[#C2788E]/15 shadow-[inset_0_0_0_1px_rgba(212,165,116,0.22)]"
        aria-hidden="true"
      >
        <Icon size={15} className="text-[#D4A574]" />
      </span>

      {current ? (
        <p className="flex-1 min-w-0 line-clamp-2 sm:truncate text-[13px] sm:text-[14px] text-[#F0EAE0] leading-snug">
          <span className="font-medium">{currentSlotPhrase(name, current.title)}</span>
          <span className="text-[#9B9287]"> · jusqu'à <span className="num">{shortTime(current.end_time)}</span></span>
          {current.location && <span className="text-[#9B9287]"> · {current.location}</span>}
        </p>
      ) : (
        <p className="flex-1 min-w-0 line-clamp-2 sm:truncate text-[13px] sm:text-[14px] text-[#F0EAE0] leading-snug">
          <span className="font-medium">{name} est libre</span>
          <span className="text-[#9B9287]"> · prochain : {next!.title} à <span className="num">{shortTime(next!.start_time)}</span></span>
        </p>
      )}

      {current && (
        <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] tracking-[0.12em] uppercase text-[#9B9287]">
          <span className="relative flex size-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#8FB3A9] opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2 rounded-full bg-[#8FB3A9]" />
          </span>
          <span className="hidden sm:inline">En cours</span>
        </span>
      )}
    </div>
  )
}
