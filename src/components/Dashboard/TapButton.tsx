import { useState, useEffect, useRef, useCallback } from 'react'
import { Heart, Flame } from 'lucide-react'
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
  const [showFlames, setShowFlames] = useState(false)
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; delay: number }[]>([])
  const particleId = useRef(0)
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

    if (!controller.signal.aborted) {
      setTodayCount(count ?? 0)
    }

    if (partnerProfile) {
      const { count: pCount } = await supabase
        .from('taps')
        .select('*', { count: 'exact', head: true })
        .eq('sender_id', partnerProfile.id)
        .eq('receiver_id', profile.id)
        .gte('created_at', today)
        .abortSignal(controller.signal)

      if (!controller.signal.aborted) {
        setPartnerTodayCount(pCount ?? 0)
      }

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

      // Calculate consecutive days streak
      await loadStreak(controller.signal)
    }
  }, [profile, partnerProfile])

  const loadStreak = async (signal: AbortSignal) => {
    if (!profile || !partnerProfile) return

    // Get distinct dates where BOTH partners tapped each other
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

    // Find consecutive days where both tapped
    let streak = 0
    const now = new Date()
    for (let i = 0; i < 60; i++) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const ds = d.toISOString().split('T')[0]
      if (myDays.has(ds) && partnerDays.has(ds)) {
        streak++
      } else if (i === 0) {
        // Today might not have both yet, skip
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
        setShowFlames(true)
        spawnParticles()
        setTimeout(() => setReceivedTap(false), 4000)
        setTimeout(() => setShowFlames(false), 2000)
        loadTaps()
      })
      .subscribe()

    return () => {
      abortRef.current?.abort()
      supabase.removeChannel(channel)
    }
  }, [profile, loadTaps])

  const spawnParticles = () => {
    const newParticles = Array.from({ length: 8 }, () => ({
      id: particleId.current++,
      x: Math.random() * 80 - 40,
      y: -(Math.random() * 60 + 20),
      delay: Math.random() * 0.3,
    }))
    setParticles(prev => [...prev, ...newParticles])
    setTimeout(() => {
      setParticles(prev => prev.filter(p => !newParticles.includes(p)))
    }, 1200)
  }

  const sendTap = async () => {
    if (!profile || !partnerProfile || tapped) return

    await supabase.from('taps').insert({
      sender_id: profile.id,
      receiver_id: partnerProfile.id,
    })

    setTapped(true)
    setShowFlames(true)
    setTodayCount((c) => c + 1)
    spawnParticles()
    setTimeout(() => setTapped(false), 1500)
    setTimeout(() => setShowFlames(false), 1500)
  }

  const totalToday = todayCount + partnerTodayCount

  // Flame intensity based on streak
  const getFlameColor = () => {
    if (consecutiveDays >= 30) return 'text-orange-400'
    if (consecutiveDays >= 14) return 'text-amber-400'
    if (consecutiveDays >= 7) return 'text-yellow-400'
    if (consecutiveDays >= 3) return 'text-orange-300'
    return 'text-text-dim'
  }

  const getFlameSize = () => {
    if (consecutiveDays >= 30) return 'text-4xl'
    if (consecutiveDays >= 7) return 'text-3xl'
    return 'text-2xl'
  }

  return (
    <div className="card-glow text-center relative overflow-hidden">
      {/* Fire particles */}
      {particles.map(p => (
        <span
          key={p.id}
          className="absolute pointer-events-none animate-fire-particle"
          style={{
            left: `calc(50% + ${p.x}px)`,
            top: '50%',
            animationDelay: `${p.delay}s`,
            fontSize: `${12 + Math.random() * 10}px`,
          }}
        >
          {['🔥', '✨', '💕', '❤️‍🔥'][Math.floor(Math.random() * 4)]}
        </span>
      ))}

      {/* Header with streak flame */}
      <div className="flex items-center justify-center gap-2 mb-3">
        <Heart size={14} className="text-secondary" />
        <h3 className="text-sm font-semibold">Je pense à toi</h3>
      </div>

      {/* Streak flame badge */}
      {consecutiveDays > 0 && (
        <div className="flex items-center justify-center gap-1.5 mb-3 animate-fade-in">
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-orange-500/15 to-amber-500/10 border border-orange-500/20`}>
            <Flame size={14} className={`${getFlameColor()} animate-flame-flicker`} />
            <span className={`${getFlameSize()} font-extrabold leading-none tabular-nums ${getFlameColor()}`}>
              {consecutiveDays}
            </span>
            <span className="text-[10px] text-orange-300/70 font-medium ml-0.5">
              jour{consecutiveDays > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {/* Heart button */}
      <div className="relative inline-flex items-center justify-center mb-3">
        {/* Flame aura */}
        {showFlames && (
          <div className="absolute inset-0 w-24 h-24 -m-2">
            <div className="absolute inset-0 rounded-full bg-gradient-to-t from-orange-500/30 via-amber-400/20 to-transparent animate-flame-pulse" />
            <div className="absolute inset-1 rounded-full bg-gradient-to-t from-secondary/25 via-pink-400/15 to-transparent animate-flame-pulse" style={{ animationDelay: '0.15s' }} />
          </div>
        )}

        {/* Ripple rings */}
        {showFlames && (
          <>
            <span className="absolute w-20 h-20 rounded-full border-2 border-orange-400/40 animate-ripple" />
            <span className="absolute w-20 h-20 rounded-full border-2 border-amber-400/30 animate-ripple" style={{ animationDelay: '0.15s' }} />
            <span className="absolute w-20 h-20 rounded-full border-2 border-secondary/20 animate-ripple" style={{ animationDelay: '0.3s' }} />
          </>
        )}

        <button
          onClick={sendTap}
          disabled={tapped}
          className={`relative z-10 inline-flex items-center justify-center w-[4.5rem] h-[4.5rem] rounded-full transition-all duration-500 ${
            tapped
              ? 'bg-gradient-to-br from-orange-500/40 to-secondary/30 scale-110 shadow-[0_0_35px_rgba(249,115,22,0.4)]'
              : receivedTap
                ? 'bg-gradient-to-br from-secondary/30 to-pink-500/20 scale-105 shadow-[0_0_25px_rgba(236,72,153,0.25)]'
                : 'bg-gradient-to-br from-primary/20 to-secondary/10 hover:from-orange-500/25 hover:to-secondary/15 hover:scale-105 active:scale-90 hover:shadow-[0_0_25px_rgba(249,115,22,0.2)]'
          }`}
        >
          <Heart
            size={32}
            className={`transition-all duration-500 ${
              tapped
                ? 'text-orange-400 fill-current animate-heartbeat'
                : receivedTap
                  ? 'text-secondary fill-current animate-heartbeat'
                  : 'text-primary hover:text-orange-400'
            }`}
          />
        </button>

        {/* Received badge */}
        {receivedTap && (
          <span className="absolute -top-1 -right-1 z-20 bg-gradient-to-r from-orange-500 to-secondary text-white text-[10px] px-2 py-0.5 rounded-full animate-bounce-in font-semibold shadow-lg">
            ❤️‍🔥
          </span>
        )}
      </div>

      {/* Status message */}
      <p className="text-sm font-medium mb-1 min-h-[1.25rem] transition-all">
        {tapped ? (
          <span className="text-orange-400 animate-fade-in">🔥 Envoyé !</span>
        ) : receivedTap ? (
          <span className="text-secondary animate-bounce-in">
            {partnerProfile?.display_name} pense à toi ! 💗
          </span>
        ) : (
          <span className="text-text-dim text-xs">Appuie pour envoyer</span>
        )}
      </p>

      {/* Stats */}
      {totalToday > 0 && (
        <div className="mt-2 pt-2 border-t border-surface-lighter/50">
          <div className="flex items-center justify-center gap-3 text-[11px]">
            <span className="text-text-muted">
              <span className="text-orange-400 font-semibold">{todayCount}</span> envoyé{todayCount > 1 ? 's' : ''}
            </span>
            {partnerTodayCount > 0 && (
              <span className="text-text-muted">
                <span className="text-secondary font-semibold">{partnerTodayCount}</span> reçu{partnerTodayCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {lastPartnerTap && (
            <p className="text-[10px] text-text-dim mt-1">
              Dernier reçu {formatDistanceToNow(new Date(lastPartnerTap), { addSuffix: true, locale: fr })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
