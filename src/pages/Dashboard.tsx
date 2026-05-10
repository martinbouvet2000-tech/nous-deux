import { useAuthStore } from '@/stores/authStore'
import ClockWeather from '@/components/Dashboard/ClockWeather'
import CountdownWidget from '@/components/Dashboard/CountdownWidget'
import MoodWidget from '@/components/Dashboard/MoodWidget'
import TapButton from '@/components/Dashboard/TapButton'
import StreakWidget from '@/components/Dashboard/StreakWidget'
import QuestionWidget from '@/components/Dashboard/QuestionWidget'
import LoveNoteWidget from '@/components/Dashboard/LoveNoteWidget'

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

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Hero greeting */}
      <div className="text-center mb-2">
        <p className="text-sm text-text-muted mb-1">{getGreetingEmoji()} {getGreeting()}</p>
        <h1 className="text-2xl md:text-3xl font-bold gradient-text">
          {profile?.display_name} {partnerProfile ? `& ${partnerProfile.display_name}` : ''}
        </h1>
        {!partnerProfile && (
          <p className="text-xs text-text-dim mt-2 max-w-xs mx-auto">
            Invite ton/ta partenaire depuis les Réglages pour débloquer toutes les fonctionnalités
          </p>
        )}
      </div>

      {/* Love note banner */}
      <LoveNoteWidget />

      {/* Clocks + Countdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ClockWeather />
        <CountdownWidget />
      </div>

      {/* Heart + Streak + Mood */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="sm:col-span-1">
          <TapButton />
        </div>
        <div className="sm:col-span-1">
          <StreakWidget />
        </div>
        <div className="sm:col-span-2 lg:col-span-2">
          <MoodWidget />
        </div>
      </div>

      {/* Question of the day */}
      <QuestionWidget />
    </div>
  )
}
