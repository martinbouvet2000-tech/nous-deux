import { useState, useEffect, useCallback } from 'react'
import Backdrop from '@/components/Backdrop'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { moodFromRow } from '@/lib/moods'

export default function AmbientMood({ children }: { children: React.ReactNode }) {
  const { profile, partnerProfile } = useAuthStore()
  const [myGlow, setMyGlow] = useState<string | null>(null)
  const [partnerGlow, setPartnerGlow] = useState<string | null>(null)

  const loadCurrentMoods = useCallback(async () => {
    if (!profile) return
    const today = format(new Date(), 'yyyy-MM-dd')

    const { data: myData } = await supabase
      .from('moods').select('emoji,state').eq('user_id', profile.id).gte('created_at', today)
      .order('created_at', { ascending: false }).limit(1)
    setMyGlow(moodFromRow(myData?.[0])?.glow ?? null)

    if (partnerProfile) {
      const { data: pData } = await supabase
        .from('moods').select('emoji,state').eq('user_id', partnerProfile.id).gte('created_at', today)
        .order('created_at', { ascending: false }).limit(1)
      setPartnerGlow(moodFromRow(pData?.[0])?.glow ?? null)
    } else {
      setPartnerGlow(null)
    }
  }, [profile, partnerProfile])

  useEffect(() => {
    if (!profile) return
    loadCurrentMoods()

    // Un canal par utilisateur, filtré : on n'écoute que nos deux humeurs
    const channel = supabase.channel(`ambient:${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moods', filter: `user_id=eq.${profile.id}` }, () => loadCurrentMoods())
    if (partnerProfile) {
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moods', filter: `user_id=eq.${partnerProfile.id}` }, () => loadCurrentMoods())
    }
    channel.subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile, partnerProfile, loadCurrentMoods])


  return (
    <div className="relative min-h-full">
      <Backdrop glowA={myGlow ?? 'rgba(212,165,116,0.16)'} glowB={partnerGlow ?? 'rgba(194,120,142,0.12)'} />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  )
}
