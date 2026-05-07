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

function formatDate(timezone: string): string {
  return new Date().toLocaleDateString('fr-FR', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

interface PersonClockProps {
  name: string
  timezone: string
  city: string | null
  isPartner?: boolean
}

function PersonClock({ name, timezone, city, isPartner }: PersonClockProps) {
  const [time, setTime] = useState(formatTime(timezone))
  const [date, setDate] = useState(formatDate(timezone))

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(formatTime(timezone))
      setDate(formatDate(timezone))
    }, 1000)
    return () => clearInterval(interval)
  }, [timezone])

  return (
    <div className={`flex-1 text-center p-4 rounded-xl ${isPartner ? 'bg-secondary/10' : 'bg-primary/10'}`}>
      <p className="text-xs text-text-muted mb-1 flex items-center justify-center gap-1">
        <MapPin size={12} />
        {city || timezone}
      </p>
      <p className="text-sm font-medium mb-2">{name}</p>
      <p className="text-3xl font-bold tabular-nums">{time}</p>
      <p className="text-xs text-text-muted mt-1 capitalize">{date}</p>
    </div>
  )
}

export default function ClockWeather() {
  const { profile, partnerProfile } = useAuthStore()

  if (!profile) return null

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Clock size={16} className="text-primary" />
        <h3 className="text-sm font-semibold">Nos horloges</h3>
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
