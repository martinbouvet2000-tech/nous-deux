import { useState, useEffect } from 'react'
import { Smile } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { Mood } from '@/types/database'

const MOODS = [
  { emoji: '😊', label: 'Heureux' },
  { emoji: '🥰', label: 'Amoureux' },
  { emoji: '😌', label: 'Serein' },
  { emoji: '😴', label: 'Fatigué' },
  { emoji: '😔', label: 'Triste' },
  { emoji: '😤', label: 'Frustré' },
  { emoji: '🤒', label: 'Malade' },
  { emoji: '🤩', label: 'Excité' },
  { emoji: '😰', label: 'Stressé' },
  { emoji: '🥳', label: 'Festif' },
]

export default function MoodWidget() {
  const { profile, partnerProfile } = useAuthStore()
  const [myMood, setMyMood] = useState<Mood | null>(null)
  const [partnerMood, setPartnerMood] = useState<Mood | null>(null)

  useEffect(() => {
    if (!profile) return
    loadMoods()

    const channel = supabase
      .channel('moods-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moods' }, () => {
        loadMoods()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile, partnerProfile])

  const loadMoods = async () => {
    if (!profile) return

    const today = new Date().toISOString().split('T')[0]

    const { data: myData } = await supabase
      .from('moods')
      .select('*')
      .eq('user_id', profile.id)
      .gte('created_at', today)
      .order('created_at', { ascending: false })
      .limit(1)

    if (myData?.[0]) setMyMood(myData[0])

    if (partnerProfile) {
      const { data: partnerData } = await supabase
        .from('moods')
        .select('*')
        .eq('user_id', partnerProfile.id)
        .gte('created_at', today)
        .order('created_at', { ascending: false })
        .limit(1)

      if (partnerData?.[0]) setPartnerMood(partnerData[0])
    }
  }

  const selectMood = async (emoji: string, label: string) => {
    if (!profile) return

    await supabase.from('moods').insert({
      user_id: profile.id,
      emoji,
      label,
    })

    loadMoods()
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Smile size={16} className="text-accent" />
        <h3 className="text-sm font-semibold">Humeur du jour</h3>
      </div>

      <div className="flex gap-4 mb-3">
        <div className="flex-1 text-center">
          <p className="text-xs text-text-muted mb-1">{profile?.display_name}</p>
          {myMood ? (
            <div>
              <span className="text-3xl">{myMood.emoji}</span>
              <p className="text-xs text-text-muted mt-1">{myMood.label}</p>
            </div>
          ) : (
            <p className="text-2xl">❓</p>
          )}
        </div>

        {partnerProfile && (
          <div className="flex-1 text-center">
            <p className="text-xs text-text-muted mb-1">{partnerProfile.display_name}</p>
            {partnerMood ? (
              <div>
                <span className="text-3xl">{partnerMood.emoji}</span>
                <p className="text-xs text-text-muted mt-1">{partnerMood.label}</p>
              </div>
            ) : (
              <p className="text-2xl">❓</p>
            )}
          </div>
        )}
      </div>

      {!myMood && (
        <div>
          <p className="text-xs text-text-muted mb-2 text-center">Comment tu te sens ?</p>
          <div className="grid grid-cols-5 gap-2">
            {MOODS.map(({ emoji, label }) => (
              <button
                key={emoji}
                onClick={() => selectMood(emoji, label)}
                className="flex flex-col items-center gap-0.5 p-2 rounded-lg hover:bg-surface-lighter transition-colors"
                title={label}
              >
                <span className="text-xl">{emoji}</span>
                <span className="text-[10px] text-text-muted">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
