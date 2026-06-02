import { useState, useEffect } from 'react'
import { MapPin } from 'lucide-react'
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
  variant: 'amber' | 'rose'
}

function PersonClock({ name, timezone, city, variant }: PersonClockProps) {
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

  const tintColor = variant === 'amber'
    ? 'rgba(212, 165, 116, 0.04)'
    : 'rgba(194, 120, 142, 0.04)'

  const glowColor = variant === 'amber'
    ? '0 0 20px rgba(212, 165, 116, 0.06)'
    : '0 0 20px rgba(194, 120, 142, 0.06)'

  return (
    <div
      className="flex-1 text-center p-5 rounded-2xl transition-all duration-500 ease-out"
      style={{ backgroundColor: tintColor }}
    >
      <div className="flex items-center justify-center gap-1 mb-1">
        <MapPin size={10} className="text-[#6B6359]" />
        <p className="text-[11px] tracking-wide text-[#6B6359] uppercase">
          {city || timezone.split('/').pop()?.replace('_', ' ')}
        </p>
      </div>
      <p className="text-[11px] tracking-wide text-[#9B9287] font-medium mb-3">{name}</p>
      <div className="flex items-baseline justify-center gap-0.5">
        <p
          className="text-4xl font-light tabular-nums tracking-tight text-[#F0EAE0]"
          style={{ textShadow: glowColor }}
        >
          {time}
        </p>
        <span className="text-lg text-[#6B6359] tabular-nums font-light">:{seconds}</span>
      </div>
      <p className="text-[11px] tracking-wide text-[#6B6359] mt-2 capitalize">{date}</p>
    </div>
  )
}

export default function ClockWeather() {
  const { profile, partnerProfile } = useAuthStore()

  if (!profile) return null

  const timeDiff = partnerProfile ? getTimeDiffLabel(profile.timezone, partnerProfile.timezone) : null

  return (
    <div className="group relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] transition-all duration-500 ease-out hover:bg-[#252118] hover:shadow-[0_8px_48px_rgba(0,0,0,0.3),0_0_0_1px_rgba(212,165,116,0.04)]">
      {/* Top glow line */}
      <div
        className="absolute top-0 left-[15%] right-[15%] h-px transition-opacity duration-500 ease-out opacity-60 group-hover:opacity-100"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(212, 165, 116, 0.12), transparent)' }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <p className="text-sm font-medium tracking-wide uppercase text-[#9B9287]">
          Nos horloges
        </p>
        {timeDiff && (
          <span className="ml-auto text-[11px] tracking-wide text-[#6B6359] bg-[rgba(255,255,255,0.03)] px-2.5 py-1 rounded-lg">
            {timeDiff}
          </span>
        )}
      </div>

      {/* Clocks */}
      <div className="flex gap-3">
        <PersonClock
          name={profile.display_name}
          timezone={profile.timezone}
          city={profile.location_city}
          variant="amber"
        />
        {partnerProfile && (
          <PersonClock
            name={partnerProfile.display_name}
            timezone={partnerProfile.timezone}
            city={partnerProfile.location_city}
            variant="rose"
          />
        )}
      </div>
    </div>
  )
}
