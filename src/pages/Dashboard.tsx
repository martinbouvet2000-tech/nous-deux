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

function getGreetingEmoji(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '🌙'
  if (hour < 12) return '☀️'
  if (hour < 18) return '🌤️'
  return '🌆'
}

export default function Dashboard() {
  const { profile, partnerProfile } = useAuthStore()

  const names = partnerProfile
    ? `${profile?.display_name} & ${partnerProfile.display_name}`
    : profile?.display_name ?? ''

  return (
    <div className="px-4 py-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Hero greeting */}
      <div className="text-center pb-2">
        <p className="text-xs text-text-dim tracking-widest uppercase mb-2">
          {getGreetingEmoji()} {getGreeting()}
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-text tracking-tight">
          {names}
        </h1>
        {!partnerProfile && (
          <p className="text-xs text-text-dim mt-3 max-w-[280px] mx-auto leading-relaxed">
            Invite ton/ta partenaire depuis les Réglages pour tout débloquer
          </p>
        )}
      </div>

      {/* Love note banner */}
      <LoveNoteWidget />

      {/* Clocks + Countdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <ClockWeather />
        </div>
        <div className="lg:col-span-5">
          <CountdownWidget />
        </div>
      </div>

      {/* Heart + Streak + Mood */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <TapButton />
        <StreakWidget />
        <MoodWidget />
      </div>

      {/* Question + Gratitude */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <QuestionWidget />
        <GratitudeWidget />
      </div>
    </div>
  )
}
