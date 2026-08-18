/** Liste complète des fuseaux IANA (avec repli si le navigateur ne la fournit pas) */
const FALLBACK_TIMEZONES = [
  'Europe/Paris', 'Europe/London', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome', 'Europe/Warsaw',
  'Europe/Lisbon', 'Europe/Brussels', 'Europe/Amsterdam', 'Europe/Zurich', 'Europe/Stockholm', 'Europe/Athens',
  'Europe/Istanbul', 'Europe/Moscow', 'Africa/Casablanca', 'Africa/Dakar', 'Africa/Abidjan', 'Africa/Lagos',
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Nairobi', 'Indian/Reunion', 'Indian/Mauritius',
  'America/New_York', 'America/Toronto', 'America/Montreal', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Vancouver', 'America/Mexico_City', 'America/Bogota', 'America/Lima', 'America/Sao_Paulo', 'America/Buenos_Aires',
  'America/Santiago', 'America/Guadeloupe', 'America/Martinique', 'America/Cayenne', 'Asia/Dubai', 'Asia/Tehran',
  'Asia/Karachi', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Asia/Jakarta',
  'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Manila', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Taipei', 'Asia/Seoul',
  'Asia/Tokyo', 'Australia/Perth', 'Australia/Adelaide', 'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane',
  'Pacific/Auckland', 'Pacific/Noumea', 'Pacific/Tahiti', 'Pacific/Honolulu', 'UTC',
]

export function getAllTimezones(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    const list = intl.supportedValuesOf?.('timeZone')
    if (list && list.length > 50) return list
  } catch { /* ignore */ }
  return FALLBACK_TIMEZONES
}

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'
  } catch {
    return 'Europe/Paris'
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Décalage (en minutes) d'un fuseau par rapport à UTC à un instant donné — fiable, sans hack de parsing */
export function utcOffsetMinutes(tz: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUTC - at.getTime()) / 60000)
}

/**
 * Différence lisible entre deux fuseaux : "+5h30", "-6h", ou null si identiques.
 * Gère les décalages de 30/45 min (Inde, Népal, Adélaïde…).
 */
export function timezoneDiffLabel(fromTz: string, toTz: string, at: Date = new Date()): string | null {
  if (!isValidTimezone(fromTz) || !isValidTimezone(toTz)) return null
  const diff = utcOffsetMinutes(toTz, at) - utcOffsetMinutes(fromTz, at)
  if (diff === 0) return null
  const sign = diff > 0 ? '+' : '-'
  const abs = Math.abs(diff)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `${sign}${h}h${m ? String(m).padStart(2, '0') : ''}`
}

/** Libellé court d'un fuseau : "Paris", "New York" */
export function timezoneCity(tz: string): string {
  return (tz.split('/').pop() ?? tz).replace(/_/g, ' ')
}

/** Heure formatée dans un fuseau */
export function formatTimeIn(tz: string, at: Date = new Date()): string {
  try {
    return at.toLocaleTimeString('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
  } catch {
    return '--:--'
  }
}
