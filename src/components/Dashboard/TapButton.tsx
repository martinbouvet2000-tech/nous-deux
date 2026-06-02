import { useState, useEffect, useRef, useCallback } from 'react'
import { Heart } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function TapButton() {
  const { profile, partnerProfile } = useAuthStore()
  const [tapped, setTapped] = useState(false)
  const [todayCount, setTodayCount] = useState(0)
  const [partnerTodayCount, setPartnerTodayCount] = useState(0)
  const [receivedTap, setReceivedTap] = useState(false)
  const [lastPartnerTap, setLastPartnerTap] = useState<string | null>(null)
  const [consecutiveDays, setConsecutiveDays] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  const loadTaps = useCallback(async () => {
    if (!profile) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const today = new Date().toISOString().split('T')[0]

    const { count } = await supabase
      .from('taps')
      .select('*', { count: 'exact', head: true })
      .eq('sender_id', profile.id)
      .gte('created_at', today)
      .abortSignal(controller.signal)

    if (!controller.signal.aborted) setTodayCount(count ?? 0)

    if (partnerProfile) {
      const { count: pCount } = await supabase
        .from('taps')
        .select('*', { count: 'exact', head: true })
        .eq('sender_id', partnerProfile.id)
        .eq('receiver_id', profile.id)
        .gte('created_at', today)
        .abortSignal(controller.signal)

      if (!controller.signal.aborted) setPartnerTodayCount(pCount ?? 0)

      const { data: lastTap } = await supabase
        .from('taps')
        .select('created_at')
        .eq('sender_id', partnerProfile.id)
        .eq('receiver_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .abortSignal(controller.signal)

      if (!controller.signal.aborted && lastTap?.[0]) {
        setLastPartnerTap(lastTap[0].created_at)
      }

      await loadStreak(controller.signal)
    }
  }, [profile, partnerProfile])

  const loadStreak = async (signal: AbortSignal) => {
    if (!profile || !partnerProfile) return

    const { data: myDates } = await supabase
      .from('taps')
      .select('created_at')
      .eq('sender_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(60)
      .abortSignal(signal)

    const { data: partnerDates } = await supabase
      .from('taps')
      .select('created_at')
      .eq('sender_id', partnerProfile.id)
      .eq('receiver_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(60)
      .abortSignal(signal)

    if (signal.aborted) return

    const toDateStr = (d: string) => d.split('T')[0]
    const myDays = new Set((myDates ?? []).map(t => toDateStr(t.created_at)))
    const partnerDays = new Set((partnerDates ?? []).map(t => toDateStr(t.created_at)))

    let streak = 0
    const now = new Date()
    for (let i = 0; i < 60; i++) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const ds = d.toISOString().split('T')[0]
      if (myDays.has(ds) && partnerDays.has(ds)) {
        streak++
      } else if (i === 0) {
        continue
      } else {
        break
      }
    }
    setConsecutiveDays(streak)
  }

  useEffect(() => {
    if (!profile) return
    loadTaps()

    const channel = supabase
      .channel('taps-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'taps',
        filter: `receiver_id=eq.${profile.id}`,
      }, () => {
        setReceivedTap(true)
        setTimeout(() => setReceivedTap(false), 3000)
        loadTaps()
      })
      .subscribe()

    return () => {
      abortRef.current?.abort()
      supabase.removeChannel(channel)
    }
  }, [profile, loadTaps])

  const sendTap = async () => {
    if (!profile || !partnerProfile || tapped) return

    await supabase.from('taps').insert({
      sender_id: profile.id,
      receiver_id: partnerProfile.id,
    })

    setTapped(true)
    setTodayCount((c) => c + 1)
    setTimeout(() => setTapped(false), 1500)
  }

  const totalToday = todayCount + partnerTodayCount

  return (
    <div className="card text-center py-6">
      {/* Header */}
      <p className="text-xs text-text-dim tracking-wide mb-5">Je pense à toi</p>

      {/* Heart button */}
      <div className="relative inline-flex items-center justify-center mb-5">
        {/* Soft glow behind */}
        <div className={`absolute w-24 h-24 rounded-full transition-all duration-700 ${
          tapped
            ? 'bg-secondary/20 scale-110'
            : receivedTap
              ? 'bg-pink-400/15 scale-105'
              : 'bg-primary/10 scale-100'
        }`} />

        <button
          onClick={sendTap}
          disabled={tapped}
          className={`relative z-10 w-[72px] h-[72px] rounded-full flex items-center justify-center transition-all duration-300 ease-out ${
            tapped
              ? 'scale-110 bg-white/[0.08]'
              : receivedTap
                ? 'scale-105 bg-white/[0.06]'
                : 'bg-white/[0.04] hover:bg-white/[0.07] hover:scale-105 active:scale-95'
          }`}
        >
          <Heart
            size={30}
            className={`transition-all duration-300 ${
              tapped
                ? 'text-secondary fill-current scale-110'
                : receivedTap
                  ? 'text-pink-400 fill-current'
                  : 'text-text-muted hover:text-primary'
            }`}
          />
        </button>

        {/* Received indicator */}
        {receivedTap && (
          <span className="absolute -top-1 -right-1 z-20 w-5 h-5 rounded-full bg-secondary text-white text-[10px] flex items-center justify-center animate-bounce-in">
            !
          </span>
        )}
      </div>

      {/* Status */}
      <p className="text-xs min-h-[1rem] mb-1 transition-all">
        {tapped ? (
          <span className="text-secondary animate-fade-in">Envoyé !</span>
        ) : receivedTap ? (
          <span className="text-pink-400 animate-fade-in">
            {partnerProfile?.display_name} pense à toi
          </span>
        ) : (
          <span className="text-text-dim">Appuie pour envoyer</span>
        )}
      </p>

      {/* Streak */}
      {consecutiveDays > 0 && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] text-xs text-text-muted mt-2">
          <span className="text-orange-400">🔥</span>
          <span className="font-medium tabular-nums">{consecutiveDays}</span>
          <span className="text-text-dim">jour{consecutiveDays > 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Stats */}
      {totalToday > 0 && (
        <div className="mt-4 pt-3 border-t border-white/[0.04]">
          <div className="flex items-center justify-center gap-4 text-[11px] text-text-dim">
            <span><span className="text-text-muted font-medium">{todayCount}</span> envoyé{todayCount > 1 ? 's' : ''}</span>
            {partnerTodayCount > 0 && (
              <span><span className="text-text-muted font-medium">{partnerTodayCount}</span> reçu{partnerTodayCount > 1 ? 's' : ''}</span>
            )}
          </div>
          {lastPartnerTap && (
            <p className="text-[10px] text-text-dim mt-1.5">
              Dernier reçu {formatDistanceToNow(new Date(lastPartnerTap), { addSuffix: true, locale: fr })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
