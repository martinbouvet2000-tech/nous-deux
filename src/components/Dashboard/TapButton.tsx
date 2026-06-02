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
    <div className="relative overflow-hidden rounded-2xl bg-[#1E1B17] p-5 md:p-6 transition-all duration-500 ease-out flex flex-col items-center text-center group">
      {/* Top edge glow line */}
      <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60 transition-opacity duration-500 group-hover:opacity-100 group-hover:via-[rgba(212,165,116,0.2)]" />

      {/* Whisper label */}
      <p className="text-[11px] tracking-wide text-[#6B6359] uppercase mb-6">
        Je pense a toi
      </p>

      {/* Heart button area */}
      <div className="relative inline-flex items-center justify-center mb-5">
        {/* Ambient glow — always present, breathing */}
        <div
          className={`absolute w-28 h-28 rounded-full transition-all duration-700 ease-out ${
            tapped
              ? 'bg-[rgba(194,120,142,0.2)] scale-125'
              : receivedTap
                ? 'bg-[rgba(194,120,142,0.15)] scale-110'
                : 'bg-[rgba(212,165,116,0.08)] scale-100 animate-[breathe_4s_ease-in-out_infinite]'
          }`}
        />

        {/* Outer ring — soft, barely visible */}
        <div
          className={`absolute w-[88px] h-[88px] rounded-full transition-all duration-500 ease-out ${
            tapped
              ? 'shadow-[0_0_40px_rgba(194,120,142,0.25),0_0_80px_rgba(194,120,142,0.1)]'
              : receivedTap
                ? 'shadow-[0_0_40px_rgba(194,120,142,0.2),0_0_60px_rgba(194,120,142,0.08)]'
                : 'shadow-[0_0_30px_rgba(212,165,116,0.08),0_0_60px_rgba(212,165,116,0.04)]'
          }`}
        />

        {/* The heart button */}
        <button
          onClick={sendTap}
          disabled={tapped}
          className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ease-out cursor-pointer ${
            tapped
              ? 'scale-110 bg-[rgba(194,120,142,0.12)]'
              : receivedTap
                ? 'scale-105 bg-[rgba(194,120,142,0.08)]'
                : 'bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(212,165,116,0.06)] hover:scale-105 active:scale-95'
          } disabled:cursor-default`}
          style={{
            animation: !tapped && !receivedTap ? 'heartbeat 4s ease-in-out infinite' : 'none',
          }}
        >
          <Heart
            size={34}
            strokeWidth={1.5}
            className={`transition-all duration-300 ease-out ${
              tapped
                ? 'text-[#D99AAD] fill-[#C2788E] scale-110 drop-shadow-[0_0_12px_rgba(194,120,142,0.4)]'
                : receivedTap
                  ? 'text-[#D99AAD] fill-[#C2788E] drop-shadow-[0_0_10px_rgba(194,120,142,0.3)]'
                  : 'text-[#9B9287] hover:text-[#D4A574] drop-shadow-[0_0_6px_rgba(212,165,116,0.1)]'
            }`}
          />
        </button>

        {/* Tap ripple effect */}
        {tapped && (
          <div className="absolute z-0 w-20 h-20 rounded-full animate-[ripple_1s_ease-out_forwards] border border-[rgba(194,120,142,0.3)]" />
        )}

        {/* Partner thinking of you — soft pulse indicator */}
        {receivedTap && (
          <div className="absolute -top-1.5 -right-1.5 z-20">
            <span className="relative flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C2788E] opacity-40" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-[#C2788E] shadow-[0_0_8px_rgba(194,120,142,0.4)]" />
            </span>
          </div>
        )}
      </div>

      {/* Status text */}
      <p className="text-sm min-h-[1.25rem] mb-1 transition-all duration-300">
        {tapped ? (
          <span className="text-[#D99AAD] animate-[fadeInUp_0.3s_ease-out]">
            Envoye avec amour
          </span>
        ) : receivedTap ? (
          <span className="text-[#D99AAD] animate-[fadeInUp_0.3s_ease-out]">
            {partnerProfile?.display_name} pense a toi
          </span>
        ) : (
          <span className="text-[#6B6359]">Appuie pour envoyer</span>
        )}
      </p>

      {/* Streak badge */}
      {consecutiveDays > 0 && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[rgba(255,255,255,0.03)] text-[11px] tracking-wide mt-2">
          <span className="text-[#E8B86D]">
            {consecutiveDays >= 7 ? '\u{1F525}' : '\u{2728}'}
          </span>
          <span className="font-medium tabular-nums text-[#E8C9A0]">{consecutiveDays}</span>
          <span className="text-[#6B6359]">jour{consecutiveDays > 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Daily stats */}
      {totalToday > 0 && (
        <div className="w-full mt-4 pt-3 border-t border-white/[0.04]">
          <div className="flex items-center justify-center gap-4 text-[11px] tracking-wide text-[#6B6359]">
            <span>
              <span className="text-[#9B9287] font-medium tabular-nums">{todayCount}</span>{' '}
              envoye{todayCount > 1 ? 's' : ''}
            </span>
            {partnerTodayCount > 0 && (
              <span>
                <span className="text-[#9B9287] font-medium tabular-nums">{partnerTodayCount}</span>{' '}
                recu{partnerTodayCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {lastPartnerTap && (
            <p className="text-[10px] text-[#6B6359] mt-1.5">
              Dernier recu {formatDistanceToNow(new Date(lastPartnerTap), { addSuffix: true, locale: fr })}
            </p>
          )}
        </div>
      )}

      {/* Keyframes injected via style tag */}
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.06); opacity: 1; }
        }
        @keyframes heartbeat {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
        @keyframes ripple {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
