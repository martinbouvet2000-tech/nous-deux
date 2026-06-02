import { useState, useEffect } from 'react'
import { Heart } from 'lucide-react'
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

  return (
    <div className="card-glow text-center relative">
      {/* Header */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center">
          <Heart size={14} className="text-accent" />
        </div>
        <h3 className="text-sm font-semibold">Humeur du jour</h3>
      </div>

      {/* Mood display — both moods side by side */}
      {(myMood || partnerMood) && !showPicker && (
        <div className="animate-fade-in">
          <div className="flex items-center justify-center gap-6 mb-3">
            {/* My mood */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center">
                {myMood ? (
                  <span className="text-[2.75rem] leading-none animate-bounce-in">{myMood.emoji}</span>
                ) : (
                  <span className="text-3xl opacity-20">?</span>
                )}
              </div>
              <div className="text-center">
                <p className="text-[11px] font-medium text-text/70 leading-tight">
                  {profile?.display_name}
                </p>
                {myMood && (
                  <p className="text-[10px] text-text-muted mt-0.5">{myMood.label}</p>
                )}
              </div>
            </div>

            {/* Divider dot */}
            {partnerProfile && (
              <div className="w-1 h-1 rounded-full bg-white/10 self-start mt-7" />
            )}

            {/* Partner mood */}
            {partnerProfile && (
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center">
                  {partnerMood ? (
                    <span className="text-[2.75rem] leading-none animate-bounce-in">{partnerMood.emoji}</span>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Heart size={18} className="text-white/10" />
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <p className="text-[11px] font-medium text-text/70 leading-tight">
                    {partnerProfile.display_name}
                  </p>
                  {partnerMood ? (
                    <p className="text-[10px] text-text-muted mt-0.5">{partnerMood.label}</p>
                  ) : (
                    <p className="text-[10px] text-text-dim mt-0.5">En attente...</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Change button */}
          {myMood && (
            <button
              onClick={() => setShowPicker(true)}
              className="text-[11px] text-text-dim hover:text-text-muted transition-colors duration-300"
            >
              Changer
            </button>
          )}
        </div>
      )}

      {/* Mood picker */}
      {(showPicker || !myMood) && (
        <div className="animate-fade-in">
          <p className="text-xs text-text-muted mb-4">
            Comment te sens-tu ?
          </p>
          <div className="grid grid-cols-5 gap-2">
            {MOODS.map(({ emoji, label }) => (
              <button
                key={emoji}
                onClick={() => selectMood(emoji, label)}
                className={`group flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all duration-200 ease-in-out
                  hover:bg-white/[0.05] active:scale-95
                  ${animatingEmoji === emoji
                    ? 'bg-white/[0.08] ring-1 ring-accent/30 scale-105'
                    : ''
                  }`}
                title={label}
              >
                <span className="text-[1.4rem] transition-transform duration-200 ease-in-out group-hover:scale-110">
                  {emoji}
                </span>
                <span className="text-[9px] text-text-dim font-medium leading-tight group-hover:text-text-muted transition-colors duration-200">
                  {label}
                </span>
              </button>
            ))}
          </div>
          {myMood && showPicker && (
            <button
              onClick={() => setShowPicker(false)}
              className="mt-3 text-[11px] text-text-dim hover:text-text-muted transition-colors duration-300"
            >
              Annuler
            </button>
          )}
        </div>
      )}
    </div>
  )
}
