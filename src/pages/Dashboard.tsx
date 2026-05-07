import { useAuthStore } from '@/stores/authStore'
import ClockWeather from '@/components/Dashboard/ClockWeather'
import CountdownWidget from '@/components/Dashboard/CountdownWidget'
import MoodWidget from '@/components/Dashboard/MoodWidget'
import TapButton from '@/components/Dashboard/TapButton'
import StreakWidget from '@/components/Dashboard/StreakWidget'
import QuestionWidget from '@/components/Dashboard/QuestionWidget'

export default function Dashboard() {
  const { profile, partnerProfile } = useAuthStore()

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto space-y-5">
      <div className="text-center mb-2">
        <h1 className="text-2xl font-bold gradient-text">
          {profile?.display_name} {partnerProfile ? `& ${partnerProfile.display_name}` : ''}
        </h1>
        {!partnerProfile && (
          <p className="text-xs text-text-muted mt-1">
            Invite ton/ta partenaire depuis les Réglages pour débloquer toutes les fonctionnalités
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ClockWeather />
        <CountdownWidget />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <TapButton />
        <StreakWidget />
        <div className="col-span-2">
          <MoodWidget />
        </div>
      </div>

      <QuestionWidget />
    </div>
  )
}
