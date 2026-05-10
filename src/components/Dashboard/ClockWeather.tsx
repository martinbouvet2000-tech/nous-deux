import { useState, useEffect } from 'react'
import { MapPin, Clock } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

function formatTime(timezone: string): string {
  return new Date().toLocaleTimeString('fr-FR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatSeconds(timezone: string): string {
  return new Date().toLocaleTimeString('fr-FR', {
    timeZone: timezone,
    second: '2-digit',
  }).split(':').pop() || '00'
}

function formatDate(timezone: string): string {
  return new Date().toLocaleDateString('fr-FR', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function getTimeDiffLabel(tz1: string, tz2: string): string | null {
  const now = new Date()
  const d1 = new Date(now.toLocaleString('en-US', { timeZone: tz1 }))
  const d2 = new Date(now.toLocaleString('en-US', { timeZone: tz2 }))
  const diffHours = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60))
  if (diffHours === 0) return null
  const sign = diffHours > 0 ? '+' : ''
  return `${sign}${diffHours}h`
}

interface PersonClockProps {
  name: string
  timezone: string
  city: string | null
  isPartner?: boolean
}

function PersonClock({ name, timezone, city, isPartner }: PersonClockProps) {
  const [time, setTime] = useState(formatTime(timezone))
  const [seconds, setSeconds] = useState(formatSeconds(timezone))
  const [date, setDate] = useState(formatDate(timezone))

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(formatTime(timezone))
      setSeconds(formatSeconds(timezone))
      setDate(formatDate(timezone))
    }, 1000)
    return () => clearInterval(interval)
  }, [timezone])

  return (
    <div className={`flex-1 text-center p-5 rounded-2xl transition-all bg-gradient-to-br ${
      isPartner
        ? 'from-secondary/12 to-pink-500/5 border border-secondary/10'
        : 'from-primary/12 to-violet-500/5 border border-primary/10'
    }`}>
      <p className="text-[11px] text-text-muted mb-1 flex items-center justify-center gap-1 uppercase tracking-wider font-medium">
        <MapPin size={10} />
        {city || timezone.split('/').pop()?.replace('_', ' ')}
      </p>
      <p className="text-xs font-semibold mb-3 text-text/80">{name}</p>
      <div className="flex items-baseline justify-center gap-0.5">
        <p className="text-4xl font-bold tabular-nums tracking-tight">{time}</p>
        <span className="text-lg text-text-muted tabular-nums font-medium">:{seconds}</span>
      </div>
      <p className="text-xs text-text-muted mt-2 capitalize">{date}</p>
    </div>
  )
}

export default function ClockWeather() {
  const { profile, partnerProfile } = useAuthStore()

  if (!profile) return null

  const timeDiff = partnerProfile ? getTimeDiffLabel(profile.timezone, partnerProfile.timezone) : null

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
          <Clock size={15} className="text-primary" />
        </div>
        <h3 className="text-sm font-semibold">Nos horloges</h3>
        {timeDiff && (
          <span className="badge ml-auto">{timeDiff}</span>
        )}
      </div>
      <div className="flex gap-3">
        <PersonClock
          name={profile.display_name}
          timezone={profile.timezone}
          city={profile.location_city}
        />
        {partnerProfile && (
          <PersonClock
            name={partnerProfile.display_name}
            timezone={partnerProfile.timezone}
            city={partnerProfile.location_city}
            isPartner
          />
        )}
      </div>
    </div>
  )
}
