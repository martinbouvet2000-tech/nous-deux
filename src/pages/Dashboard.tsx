import { useMemo } from 'react'
import { useAuthStore } from '@/stores/authStore'
import ClockWeather from '@/components/Dashboard/ClockWeather'
import CountdownWidget from '@/components/Dashboard/CountdownWidget'
import MoodWidget from '@/components/Dashboard/MoodWidget'
import TapButton from '@/components/Dashboard/TapButton'
import StreakWidget from '@/components/Dashboard/StreakWidget'
import QuestionWidget from '@/components/Dashboard/QuestionWidget'
import LoveNoteWidget from '@/components/Dashboard/LoveNoteWidget'
import GratitudeWidget from '@/components/Dashboard/GratitudeWidget'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return 'Bonne nuit'
  if (hour < 12) return 'Bonjour'
  if (hour < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

function getDaysTogether(createdAt: string): number {
  const start = new Date(createdAt)
  const now = new Date()
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

export default function Dashboard() {
  const { profile, partnerProfile } = useAuthStore()

  const daysTogether = useMemo(() => {
    if (!profile?.created_at) return 0
    return getDaysTogether(profile.created_at)
  }, [profile?.created_at])

  return (
    <div className="px-5 md:px-8 py-8 max-w-3xl mx-auto space-y-5 animate-fade-in">
      {/* Hero greeting */}
      <div className="text-center pb-1">
        <p className="text-[11px] tracking-widest uppercase text-[#6B6359] mb-3">
          {getGreeting()}
        </p>
        <h1 className="text-3xl md:text-4xl font-light tracking-tight text-[#F0EAE0]">
          {profile?.display_name}
          {partnerProfile && (
            <>
              <span className="text-[#9B9287] mx-2 font-light">&</span>
              {partnerProfile.display_name}
            </>
          )}
          {!partnerProfile && profile?.display_name && ''}
        </h1>
        {partnerProfile ? (
          <p className="text-[11px] tracking-wide text-[#6B6359] mt-2.5">
            Jour {daysTogether} ensemble
          </p>
        ) : (
          <p className="text-xs text-[#6B6359] mt-3 max-w-[280px] mx-auto leading-relaxed">
            Invite ton partenaire depuis les Réglages pour tout débloquer
          </p>
        )}
      </div>

      {/* Love note banner — full-width warm glow */}
      <LoveNoteWidget />

      {/* Clock + Countdown — asymmetric 7/5 grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <ClockWeather />
        </div>
        <div className="lg:col-span-5">
          <CountdownWidget />
        </div>
      </div>

      {/* Tap + Streak + Mood — center prominence */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="order-2 sm:order-1">
          <StreakWidget />
        </div>
        <div className="order-1 sm:order-2">
          <TapButton />
        </div>
        <div className="order-3">
          <MoodWidget />
        </div>
      </div>

      {/* Question + Gratitude */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <QuestionWidget />
        <GratitudeWidget />
      </div>
    </div>
  )
}
