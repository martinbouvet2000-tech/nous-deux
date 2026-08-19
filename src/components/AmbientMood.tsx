import { useState, useEffect, useMemo, useCallback } from 'react'
import Backdrop from '@/components/Backdrop'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

// Mood → ambient theme mapping
const MOOD_THEMES: Record<string, {
  gradient: string      // Background gradient overlay
  particle: string      // Floating particle emoji
  glow: string          // Ambient glow color
  accent: string        // Accent tint
}> = {
  '😊': {
    gradient: 'from-amber-500/8 via-transparent to-yellow-500/5',
    particle: '✨',
    glow: 'rgba(251, 191, 36, 0.06)',
    accent: 'warm',
  },
  '🥰': {
    gradient: 'from-pink-500/10 via-rose-500/5 to-red-400/8',
    particle: '💕',
    glow: 'rgba(244, 114, 182, 0.08)',
    accent: 'love',
  },
  '😌': {
    gradient: 'from-emerald-500/8 via-transparent to-teal-500/5',
    particle: '🍃',
    glow: 'rgba(52, 211, 153, 0.06)',
    accent: 'zen',
  },
  '😴': {
    gradient: 'from-indigo-500/8 via-transparent to-blue-500/6',
    particle: '💤',
    glow: 'rgba(99, 102, 241, 0.06)',
    accent: 'night',
  },
  '😔': {
    gradient: 'from-slate-500/8 via-transparent to-blue-500/5',
    particle: '🌧️',
    glow: 'rgba(148, 163, 184, 0.05)',
    accent: 'melancholy',
  },
  '😤': {
    gradient: 'from-red-500/6 via-transparent to-orange-500/5',
    particle: '⚡',
    glow: 'rgba(239, 68, 68, 0.05)',
    accent: 'fire',
  },
  '🤒': {
    gradient: 'from-lime-500/5 via-transparent to-green-500/4',
    particle: '🌿',
    glow: 'rgba(163, 230, 53, 0.04)',
    accent: 'heal',
  },
  '🤩': {
    gradient: 'from-amber-500/10 via-yellow-400/5 to-orange-500/8',
    particle: '⭐',
    glow: 'rgba(245, 158, 11, 0.08)',
    accent: 'excited',
  },
  '😰': {
    gradient: 'from-violet-500/6 via-transparent to-purple-500/5',
    particle: '💜',
    glow: 'rgba(139, 92, 246, 0.05)',
    accent: 'stress',
  },
  '🥳': {
    gradient: 'from-fuchsia-500/8 via-pink-400/5 to-purple-500/6',
    particle: '🎉',
    glow: 'rgba(217, 70, 239, 0.07)',
    accent: 'party',
  },
}

const DEFAULT_THEME = {
  gradient: 'from-primary/5 via-transparent to-secondary/3',
  particle: '✨',
  glow: 'rgba(212, 165, 116, 0.10)',
  accent: 'default',
}

// Blend two mood themes together for couple ambiance
function blendThemes(
  theme1: typeof DEFAULT_THEME,
  theme2: typeof DEFAULT_THEME | null
): typeof DEFAULT_THEME {
  if (!theme2) return theme1
  // Use theme1 as primary, theme2 adds its glow
  return theme1
}

export default function AmbientMood({ children }: { children: React.ReactNode }) {
  const { profile, partnerProfile } = useAuthStore()
  const [myEmoji, setMyEmoji] = useState<string | null>(null)
  const [partnerEmoji, setPartnerEmoji] = useState<string | null>(null)

  const loadCurrentMoods = useCallback(async () => {
    if (!profile) return
    const today = format(new Date(), 'yyyy-MM-dd')

    const { data: myData } = await supabase
      .from('moods').select('emoji').eq('user_id', profile.id).gte('created_at', today)
      .order('created_at', { ascending: false }).limit(1)
    setMyEmoji(myData?.[0]?.emoji ?? null)

    if (partnerProfile) {
      const { data: pData } = await supabase
        .from('moods').select('emoji').eq('user_id', partnerProfile.id).gte('created_at', today)
        .order('created_at', { ascending: false }).limit(1)
      setPartnerEmoji(pData?.[0]?.emoji ?? null)
    } else {
      setPartnerEmoji(null)
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

  const myTheme = myEmoji ? (MOOD_THEMES[myEmoji] ?? DEFAULT_THEME) : DEFAULT_THEME
  const partnerTheme = partnerEmoji ? (MOOD_THEMES[partnerEmoji] ?? null) : null
  const theme = useMemo(() => blendThemes(myTheme, partnerTheme), [myTheme, partnerTheme])

  return (
    <div className="relative min-h-full">
      <Backdrop glowA={theme.glow.replace(/[\d.]+\)$/, '0.22)')} glowB={(partnerTheme?.glow ?? 'rgba(194,120,142,0.12)').replace(/[\d.]+\)$/, '0.16)')} />
      {/* Teinte d'ambiance liée à l'humeur */}
      <div
        className={`fixed inset-0 bg-gradient-to-br ${theme.gradient} pointer-events-none transition-all duration-[3000ms] ease-in-out z-0`}
        aria-hidden="true"
      />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  )
}
