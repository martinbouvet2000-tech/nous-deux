import { useState, useEffect, useRef, useCallback } from 'react'
import { Heart, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

const LOVE_MESSAGES = [
  'Tu me manques…',
  'Je pense fort à toi 💭',
  'Hâte de te retrouver',
  'Tu illumines ma journée ✨',
  'Mon cœur bat pour toi',
  'Tu es ma personne préférée',
  'Chaque seconde compte…',
  'Je t\'envoie plein d\'amour',
  'Tu es dans mes pensées',
  'Vivement qu\'on soit ensemble',
]

export default function TapButton() {
  const { profile, partnerProfile } = useAuthStore()
  const [tapped, setTapped] = useState(false)
  const [todayCount, setTodayCount] = useState(0)
  const [partnerTodayCount, setPartnerTodayCount] = useState(0)
  const [receivedTap, setReceivedTap] = useState(false)
  const [lastPartnerTap, setLastPartnerTap] = useState<string | null>(null)
  const [showRipples, setShowRipples] = useState(false)
  const [currentMessage, setCurrentMessage] = useState(
    LOVE_MESSAGES[Math.floor(Math.random() * LOVE_MESSAGES.length)]
  )
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

    // Load partner taps
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

      // Load last partner tap time
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
    }
  }, [profile, partnerProfile])

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
        setShowRipples(true)
        setTimeout(() => setReceivedTap(false), 4000)
        setTimeout(() => setShowRipples(false), 2000)
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
    setShowRipples(true)
    setTodayCount((c) => c + 1)
    setCurrentMessage(LOVE_MESSAGES[Math.floor(Math.random() * LOVE_MESSAGES.length)])
    setTimeout(() => setTapped(false), 2500)
    setTimeout(() => setShowRipples(false), 1500)
  }

  const totalTaps = todayCount + partnerTodayCount

  return (
    <div className="card-glow text-center relative">
      {/* Header */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <Sparkles size={14} className="text-secondary" />
        <h3 className="text-sm font-semibold">Je pense à toi</h3>
      </div>

      {/* Heart button with ripple effect */}
      <div className="relative inline-flex items-center justify-center mb-3">
        {/* Ripple rings */}
        {showRipples && (
          <>
            <span className="absolute w-24 h-24 rounded-full border-2 border-secondary/40 animate-ripple" />
            <span className="absolute w-24 h-24 rounded-full border-2 border-secondary/30 animate-ripple" style={{ animationDelay: '0.2s' }} />
            <span className="absolute w-24 h-24 rounded-full border-2 border-secondary/20 animate-ripple" style={{ animationDelay: '0.4s' }} />
          </>
        )}

        <button
          onClick={sendTap}
          disabled={tapped}
          className={`relative z-10 inline-flex items-center justify-center w-20 h-20 rounded-full transition-all duration-500 ${
            tapped
              ? 'bg-gradient-to-br from-secondary/40 to-pink-500/30 scale-110 shadow-[0_0_30px_rgba(236,72,153,0.3)]'
              : receivedTap
                ? 'bg-gradient-to-br from-secondary/30 to-pink-500/20 scale-105 shadow-[0_0_25px_rgba(236,72,153,0.25)]'
                : 'bg-gradient-to-br from-primary/20 to-secondary/10 hover:from-primary/30 hover:to-secondary/20 hover:scale-105 active:scale-95 hover:shadow-[0_0_20px_rgba(139,92,246,0.2)]'
          }`}
        >
          <Heart
            size={36}
            className={`transition-all duration-500 ${
              tapped
                ? 'text-secondary fill-current animate-heartbeat'
                : receivedTap
                  ? 'text-secondary fill-current animate-heartbeat'
                  : 'text-primary hover:text-secondary'
            }`}
          />
        </button>

        {/* Received notification badge */}
        {receivedTap && (
          <span className="absolute -top-1 -right-1 z-20 bg-gradient-to-r from-secondary to-pink-500 text-white text-[10px] px-2 py-0.5 rounded-full animate-bounce-in font-semibold shadow-lg">
            💕
          </span>
        )}
      </div>

      {/* Message */}
      <p className="text-sm font-medium mb-1 min-h-[1.25rem] transition-all">
        {tapped ? (
          <span className="text-secondary animate-fade-in">💕 Envoyé avec amour !</span>
        ) : receivedTap ? (
          <span className="text-secondary animate-bounce-in">
            {partnerProfile?.display_name} pense à toi ! 💗
          </span>
        ) : (
          <span className="text-text-muted">{currentMessage}</span>
        )}
      </p>

      {/* Stats */}
      {totalTaps > 0 && (
        <div className="mt-3 pt-3 border-t border-surface-lighter/50">
          <div className="flex items-center justify-center gap-4 text-[11px]">
            <span className="text-text-muted">
              <span className="text-primary font-semibold">{todayCount}</span> envoyé{todayCount > 1 ? 's' : ''}
            </span>
            {partnerTodayCount > 0 && (
              <span className="text-text-muted">
                <span className="text-secondary font-semibold">{partnerTodayCount}</span> reçu{partnerTodayCount > 1 ? 's' : ''}
              </span>
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
