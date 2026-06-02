import { useState, useEffect } from 'react'
import { Heart } from 'lucide-react'
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
    <div className="group relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] transition-all duration-500 ease-out hover:bg-[#252118] hover:shadow-[0_8px_48px_rgba(0,0,0,0.3),0_0_0_1px_rgba(212,165,116,0.04)] text-center">
      {/* Top glow line */}
      <div
        className="absolute top-0 left-[15%] right-[15%] h-px transition-opacity duration-500 ease-out opacity-60 group-hover:opacity-100"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(212, 165, 116, 0.12), transparent)' }}
      />

      {/* Header */}
      <p className="text-sm font-medium tracking-wide uppercase text-[#9B9287] mb-4">
        Humeur du jour
      </p>

      {/* Mood display */}
      {(myMood || partnerMood) && !showPicker && (
        <div className="animate-fade-in">
          <div className="flex items-center justify-center gap-6 mb-3">
            {/* My mood */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-14 h-14 rounded-2xl bg-[rgba(255,255,255,0.03)] flex items-center justify-center">
                {myMood ? (
                  <span className="text-[2.5rem] leading-none animate-bounce-in">{myMood.emoji}</span>
                ) : (
                  <span className="text-2xl opacity-20">?</span>
                )}
              </div>
              <div className="text-center">
                <p className="text-[11px] tracking-wide text-[#9B9287] leading-tight">
                  {profile?.display_name}
                </p>
                {myMood && (
                  <p className="text-[10px] text-[#6B6359] mt-0.5">{myMood.label}</p>
                )}
              </div>
            </div>

            {/* Divider */}
            {partnerProfile && (
              <div className="w-px h-8 bg-[rgba(212,165,116,0.08)] self-start mt-3" />
            )}

            {/* Partner mood */}
            {partnerProfile && (
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-14 h-14 rounded-2xl bg-[rgba(255,255,255,0.03)] flex items-center justify-center">
                  {partnerMood ? (
                    <span className="text-[2.5rem] leading-none animate-bounce-in">{partnerMood.emoji}</span>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Heart size={16} className="text-[#6B6359]/40" />
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <p className="text-[11px] tracking-wide text-[#9B9287] leading-tight">
                    {partnerProfile.display_name}
                  </p>
                  {partnerMood ? (
                    <p className="text-[10px] text-[#6B6359] mt-0.5">{partnerMood.label}</p>
                  ) : (
                    <p className="text-[10px] text-[#6B6359] mt-0.5">En attente...</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Change button */}
          {myMood && (
            <button
              onClick={() => setShowPicker(true)}
              className="text-[11px] text-[#6B6359] hover:text-[#9B9287] transition-colors duration-300"
            >
              Changer
            </button>
          )}
        </div>
      )}

      {/* Mood picker */}
      {(showPicker || !myMood) && (
        <div className="animate-fade-in">
          <p className="text-sm leading-relaxed text-[#9B9287] mb-4">
            Comment te sens-tu ?
          </p>
          <div className="grid grid-cols-5 gap-2">
            {MOODS.map(({ emoji, label }) => (
              <button
                key={emoji}
                onClick={() => selectMood(emoji, label)}
                className={`group/emoji flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl transition-all duration-300 ease-out
                  hover:bg-[rgba(212,165,116,0.06)] active:scale-95
                  ${animatingEmoji === emoji
                    ? 'bg-[rgba(212,165,116,0.08)] scale-105'
                    : ''
                  }`}
                title={label}
              >
                <span
                  className="text-[1.4rem] transition-all duration-300 ease-out group-hover/emoji:scale-110"
                  style={{
                    filter: animatingEmoji === emoji ? 'none' : 'none',
                  }}
                >
                  {emoji}
                </span>
                <span className="text-[9px] text-[#6B6359] font-medium leading-tight group-hover/emoji:text-[#9B9287] transition-colors duration-300">
                  {label}
                </span>
              </button>
            ))}
          </div>
          {myMood && showPicker && (
            <button
              onClick={() => setShowPicker(false)}
              className="mt-3 text-[11px] text-[#6B6359] hover:text-[#9B9287] transition-colors duration-300"
            >
              Annuler
            </button>
          )}
        </div>
      )}
    </div>
  )
}
