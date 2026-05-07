import { useState, useEffect, useRef, useCallback } from 'react'
import { Heart } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export default function TapButton() {
  const { profile, partnerProfile } = useAuthStore()
  const [tapped, setTapped] = useState(false)
  const [todayCount, setTodayCount] = useState(0)
  const [receivedTap, setReceivedTap] = useState(false)
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
  }, [profile])

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
    setTimeout(() => setTapped(false), 2000)
  }

  return (
    <div className="card text-center">
      <button
        onClick={sendTap}
        disabled={tapped}
        className={`relative inline-flex items-center justify-center w-20 h-20 rounded-full transition-all duration-300 ${
          tapped
            ? 'bg-secondary/30 scale-110'
            : receivedTap
              ? 'bg-secondary/40 animate-pulse scale-105'
              : 'bg-primary/20 hover:bg-primary/30 hover:scale-105 active:scale-95'
        }`}
      >
        <Heart
          size={36}
          className={`transition-all duration-300 ${
            tapped || receivedTap ? 'text-secondary fill-current' : 'text-primary'
          }`}
        />
        {receivedTap && (
          <span className="absolute -top-2 -right-2 bg-secondary text-white text-[10px] px-1.5 py-0.5 rounded-full animate-bounce">
            💕
          </span>
        )}
      </button>
      <p className="text-xs text-text-muted mt-2">
        {tapped
          ? '💕 Envoyé !'
          : receivedTap
            ? `${partnerProfile?.display_name} pense à toi !`
            : 'Je pense à toi'}
      </p>
      {todayCount > 0 && (
        <p className="text-[10px] text-text-muted mt-1">{todayCount}x aujourd'hui</p>
      )}
    </div>
  )
}
