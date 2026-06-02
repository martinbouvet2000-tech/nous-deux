import { useState, useEffect, useMemo } from 'react'
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
  particle: '💜',
  glow: 'rgba(139, 92, 246, 0.04)',
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

interface FloatingParticle {
  id: number
  emoji: string
  x: number
  y: number
  duration: number
  delay: number
  size: number
}

let particleCounter = 0

export default function AmbientMood({ children }: { children: React.ReactNode }) {
  const { profile, partnerProfile } = useAuthStore()
  const [myEmoji, setMyEmoji] = useState<string | null>(null)
  const [partnerEmoji, setPartnerEmoji] = useState<string | null>(null)
  const [particles, setParticles] = useState<FloatingParticle[]>([])

  useEffect(() => {
    if (!profile) return
    loadCurrentMoods()

    const channel = supabase
      .channel('ambient-moods')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moods' }, () => {
        loadCurrentMoods()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile, partnerProfile])

  const loadCurrentMoods = async () => {
    if (!profile) return
    const today = new Date().toISOString().split('T')[0]

    const { data: myData } = await supabase
      .from('moods')
      .select('emoji')
      .eq('user_id', profile.id)
      .gte('created_at', today)
      .order('created_at', { ascending: false })
      .limit(1)

    if (myData?.[0]) setMyEmoji(myData[0].emoji)
    else setMyEmoji(null)

    if (partnerProfile) {
      const { data: pData } = await supabase
        .from('moods')
        .select('emoji')
        .eq('user_id', partnerProfile.id)
        .gte('created_at', today)
        .order('created_at', { ascending: false })
        .limit(1)

      if (pData?.[0]) setPartnerEmoji(pData[0].emoji)
      else setPartnerEmoji(null)
    }
  }

  const myTheme = myEmoji ? (MOOD_THEMES[myEmoji] ?? DEFAULT_THEME) : DEFAULT_THEME
  const partnerTheme = partnerEmoji ? (MOOD_THEMES[partnerEmoji] ?? null) : null
  const theme = useMemo(() => blendThemes(myTheme, partnerTheme), [myEmoji, partnerEmoji])

  // Generate floating particles based on mood
  useEffect(() => {
    if (!myEmoji && !partnerEmoji) {
      setParticles([])
      return
    }

    const emojis = [
      ...(myEmoji && MOOD_THEMES[myEmoji] ? [MOOD_THEMES[myEmoji].particle] : []),
      ...(partnerEmoji && MOOD_THEMES[partnerEmoji] ? [MOOD_THEMES[partnerEmoji].particle] : []),
    ]
    if (emojis.length === 0) return

    const newParticles: FloatingParticle[] = Array.from({ length: 3 }, (_, i) => ({
      id: ++particleCounter,
      emoji: emojis[i % emojis.length],
      x: 15 + (i * 25),
      y: 100 + (i * 15),
      duration: 18 + (i * 4),
      delay: i * 4,
      size: 10,
    }))

    setParticles(newParticles)
  }, [myEmoji, partnerEmoji])

  return (
    <div className="relative min-h-full">
      {/* Ambient gradient overlay */}
      <div
        className={`fixed inset-0 bg-gradient-to-br ${theme.gradient} pointer-events-none transition-all duration-[3000ms] ease-in-out z-0`}
      />

      {/* Ambient glow orbs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className="absolute top-1/4 -left-20 w-96 h-96 rounded-full blur-[150px] animate-float transition-all duration-[3000ms]"
          style={{ background: theme.glow }}
        />
        <div
          className="absolute bottom-1/4 -right-20 w-80 h-80 rounded-full blur-[130px] animate-float transition-all duration-[3000ms]"
          style={{
            background: partnerTheme?.glow ?? theme.glow,
            animationDelay: '3s',
          }}
        />
      </div>

      {/* Floating mood particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="fixed pointer-events-none z-0 animate-float opacity-[0.08]"
          style={{
            left: `${p.x}%`,
            top: `-${p.size}px`,
            fontSize: `${p.size}px`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        >
          {p.emoji}
        </div>
      ))}

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  )
}
