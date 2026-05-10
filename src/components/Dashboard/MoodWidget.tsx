import { useState, useEffect } from 'react'
import { Smile, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { Mood } from '@/types/database'

const MOODS = [
  { emoji: '😊', label: 'Heureux', color: 'from-yellow-400/20 to-orange-400/10' },
  { emoji: '🥰', label: 'Amoureux', color: 'from-pink-400/20 to-red-400/10' },
  { emoji: '😌', label: 'Serein', color: 'from-green-400/20 to-emerald-400/10' },
  { emoji: '😴', label: 'Fatigué', color: 'from-indigo-400/20 to-blue-400/10' },
  { emoji: '😔', label: 'Triste', color: 'from-blue-400/20 to-slate-400/10' },
  { emoji: '😤', label: 'Frustré', color: 'from-red-400/20 to-orange-400/10' },
  { emoji: '🤒', label: 'Malade', color: 'from-lime-400/20 to-green-400/10' },
  { emoji: '🤩', label: 'Excité', color: 'from-amber-400/20 to-yellow-400/10' },
  { emoji: '😰', label: 'Stressé', color: 'from-purple-400/20 to-violet-400/10' },
  { emoji: '🥳', label: 'Festif', color: 'from-fuchsia-400/20 to-pink-400/10' },
]

export default function MoodWidget() {
  const { profile, partnerProfile } = useAuthStore()
  const [myMood, setMyMood] = useState<Mood | null>(null)
  const [partnerMood, setPartnerMood] = useState<Mood | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [animatingEmoji, setAnimatingEmoji] = useState<string | null>(null)

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
    else setMyMood(null)

    if (partnerProfile) {
      const { data: partnerData } = await supabase
        .from('moods')
        .select('*')
        .eq('user_id', partnerProfile.id)
        .gte('created_at', today)
        .order('created_at', { ascending: false })
        .limit(1)

      if (partnerData?.[0]) setPartnerMood(partnerData[0])
      else setPartnerMood(null)
    }
  }

  const selectMood = async (emoji: string, label: string) => {
    if (!profile) return

    setAnimatingEmoji(emoji)

    await supabase.from('moods').insert({
      user_id: profile.id,
      emoji,
      label,
    })

    setTimeout(() => {
      setAnimatingEmoji(null)
      setShowPicker(false)
    }, 400)

    loadMoods()
  }

  const moodConfig = myMood ? MOODS.find(m => m.emoji === myMood.emoji) : null
  const partnerMoodConfig = partnerMood ? MOODS.find(m => m.emoji === partnerMood.emoji) : null

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center">
            <Smile size={15} className="text-accent" />
          </div>
          <h3 className="text-sm font-semibold">Humeur du jour</h3>
        </div>
        {myMood && !showPicker && (
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-primary/10"
          >
            <RefreshCw size={12} />
            Changer
          </button>
        )}
      </div>

      {/* Current moods display */}
      {(myMood || partnerMood) && !showPicker && (
        <div className="flex gap-3 mb-1">
          <div className={`flex-1 text-center p-4 rounded-xl bg-gradient-to-br ${moodConfig?.color ?? 'from-primary/10 to-primary/5'} transition-all`}>
            <p className="text-xs text-text-muted mb-1.5 font-medium">{profile?.display_name}</p>
            {myMood ? (
              <div className="animate-bounce-in">
                <span className="text-4xl block mb-1">{myMood.emoji}</span>
                <p className="text-xs font-medium text-text/80">{myMood.label}</p>
              </div>
            ) : (
              <div className="py-2">
                <span className="text-3xl opacity-30">?</span>
              </div>
            )}
          </div>

          {partnerProfile && (
            <div className={`flex-1 text-center p-4 rounded-xl bg-gradient-to-br ${partnerMoodConfig?.color ?? 'from-secondary/10 to-secondary/5'} transition-all`}>
              <p className="text-xs text-text-muted mb-1.5 font-medium">{partnerProfile.display_name}</p>
              {partnerMood ? (
                <div className="animate-bounce-in">
                  <span className="text-4xl block mb-1">{partnerMood.emoji}</span>
                  <p className="text-xs font-medium text-text/80">{partnerMood.label}</p>
                </div>
              ) : (
                <div className="py-2">
                  <span className="text-3xl opacity-30">?</span>
                  <p className="text-[10px] text-text-muted mt-1">Pas encore renseigné</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mood picker */}
      {(showPicker || !myMood) && (
        <div className="animate-fade-in">
          <p className="text-xs text-text-muted mb-3 text-center">
            {myMood ? 'Comment tu te sens maintenant ?' : 'Comment tu te sens aujourd\'hui ?'}
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {MOODS.map(({ emoji, label, color }) => (
              <button
                key={emoji}
                onClick={() => selectMood(emoji, label)}
                className={`flex flex-col items-center gap-1 p-2.5 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 bg-gradient-to-br ${color} hover:shadow-lg ${
                  animatingEmoji === emoji ? 'scale-110 ring-2 ring-primary/50' : ''
                }`}
                title={label}
              >
                <span className="text-2xl">{emoji}</span>
                <span className="text-[10px] text-text-muted font-medium">{label}</span>
              </button>
            ))}
          </div>
          {myMood && showPicker && (
            <button
              onClick={() => setShowPicker(false)}
              className="w-full mt-3 text-xs text-text-muted hover:text-text transition-colors py-1.5"
            >
              Annuler
            </button>
          )}
        </div>
      )}
    </div>
  )
}
